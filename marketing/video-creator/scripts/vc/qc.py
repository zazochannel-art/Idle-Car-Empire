"""Automated quality control of an exported video.

Every check returns {"name", "status": pass|warn|fail, "detail"}.  A video only counts as delivered if no check fails.
"""
import json
import re
import subprocess

import numpy as np

from . import config as C
from .registry import sha256
from .scenes import source_path

SAMPLE_FPS = 4


def _ffprobe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffprobe failed: " + r.stderr[:300])
    return json.loads(r.stdout)


def _chk(name, status, detail):
    return {"name": name, "status": status, "detail": detail}


def _rel_lum(rgb):
    """WCAG relative luminance of an (…,3) uint8 array."""
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def probe_summary(path):
    j = _ffprobe(path)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    return {
        "container": j["format"]["format_name"], "duration_s": round(float(j["format"]["duration"]), 3),
        "size_mb": round(int(j["format"]["size"]) / 1e6, 2), "bit_rate_kbps": round(int(j["format"]["bit_rate"]) / 1000),
        "video": {"codec": v["codec_name"], "profile": v.get("profile"), "width": v["width"], "height": v["height"],
                  "pix_fmt": v["pix_fmt"], "fps": v["avg_frame_rate"], "sar": v.get("sample_aspect_ratio", "1:1"),
                  "dar": v.get("display_aspect_ratio", "9:16"), "frames": int(v.get("nb_frames", 0))},
        "audio": None if a is None else {"codec": a["codec_name"], "sample_rate": int(a["sample_rate"]),
                                         "channels": a["channels"]},
    }


def run_qc(path, layout, spec, platform_key, plat, defaults, registry, expected_duration):
    checks = []
    info = probe_summary(path)
    v, a = info["video"], info["audio"]
    W, H = defaults["width"], defaults["height"]

    # 1 ── source provenance ------------------------------------------------------------------
    bad, notes = [], []
    for sc in layout["scenes"][:-1]:
        e = registry.get(sc["source"])
        if e is None:
            bad.append(f"{sc['source']}: not in config/sources.json")
            continue
        if not e.get("real"):
            bad.append(f"{sc['source']}: not flagged real")
        if not e.get("origin"):
            bad.append(f"{sc['source']}: no origin recorded")
        p = source_path(e)
        if not p.exists():
            bad.append(f"{sc['source']}: file missing")
        elif e.get("sha256") and sha256(p) != e["sha256"]:
            notes.append(f"{sc['source']}: file changed since registration")
    if bad:
        checks.append(_chk("source_is_real_gameplay", "fail", "; ".join(bad)))
    else:
        fb = [s for s in layout["scenes"][:-1] if s["fallback"]]
        used = sorted({s["source"] for s in layout["scenes"][:-1]})
        detail = f"{len(used)} registered real sources used: {', '.join(used)}"
        if notes:
            detail += " | WARNING " + "; ".join(notes)
        checks.append(_chk("source_is_real_gameplay", "warn" if notes else "pass", detail))
        if fb:
            checks.append(_chk("source_type", "warn",
                               f"{len(fb)} scene(s) use still screenshots (no screen recording registered yet)"))

    # 2 ── format --------------------------------------------------------------------------------
    ok = (v["codec"] == "h264" and v["width"] == W and v["height"] == H and v["pix_fmt"] == "yuv420p"
          and v["fps"] == f"{defaults['fps']}/1" and v["sar"] in ("1:1", "0:1"))
    checks.append(_chk("video_format", "pass" if ok else "fail",
                       f"{v['codec']} {v['profile']} {v['width']}x{v['height']} {v['pix_fmt']} {v['fps']} fps sar {v['sar']}"))
    ar = v["width"] / v["height"]
    checks.append(_chk("aspect_ratio_9x16", "pass" if abs(ar - 9 / 16) < 0.002 else "fail", f"{ar:.4f} (9:16 = 0.5625)"))
    aok = a and a["codec"] == "aac" and a["sample_rate"] == defaults["audio_rate"] and a["channels"] == 2
    checks.append(_chk("audio_format", "pass" if aok else "fail", str(a)))
    lo, hi = C.CATEGORY_RANGES[spec["category"]]
    d = info["duration_s"]
    checks.append(_chk("duration_in_range", "pass" if lo <= d <= hi else "fail",
                       f"{d}s (category '{spec['category']}' = {lo}-{hi}s)"))
    checks.append(_chk("duration_matches_plan", "pass" if abs(d - expected_duration) < 0.15 else "fail",
                       f"{d}s vs planned {expected_duration}s"))
    checks.append(_chk("platform_limit", "pass" if d <= plat["max_duration"] else "fail",
                       f"{d}s ≤ {plat['max_duration']}s"))

    # 3 ── playback (full decode) ---------------------------------------------------------------
    r = subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True)
    cf = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                         "stream=nb_read_frames", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    frames = int(cf.stdout.strip() or 0)
    exp_frames = round(expected_duration * defaults["fps"])
    good = r.returncode == 0 and not r.stderr.strip() and abs(frames - exp_frames) <= 2
    checks.append(_chk("plays_back_cleanly", "pass" if good else "fail",
                       f"full decode rc={r.returncode}, {frames} frames (expected {exp_frames}) {r.stderr.strip()[:120]}"))
    a_dur = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration",
                            "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip()
    try:
        dv = abs(float(a_dur) - d)
        checks.append(_chk("av_sync_length", "pass" if dv < 0.12 else "fail", f"audio/video length differ by {dv:.3f}s"))
    except ValueError:
        checks.append(_chk("av_sync_length", "fail", "no audio duration"))

    # 4 ── audio levels ----------------------------------------------------------------------------
    e = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    summ = e[e.rindex("Summary:"):] if "Summary:" in e else ""
    i_m = re.search(r"I:\s+(-?[\d.]+) LUFS", summ)
    lra_m = re.search(r"LRA:\s+([\d.]+) LU", summ)
    tp_m = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ)
    if i_m and tp_m:
        I, TP = float(i_m.group(1)), float(tp_m.group(1))
        tgt = defaults["loudness_target_lufs"]
        checks.append(_chk("audio_loudness", "pass" if abs(I - tgt) <= 1.5 else "fail",
                           f"integrated {I} LUFS (target {tgt} ±1.5), LRA {lra_m.group(1) if lra_m else '?'} LU"))
        checks.append(_chk("audio_true_peak", "pass" if TP <= -1.0 else "fail", f"true peak {TP} dBTP (limit -1.0)"))
    else:
        checks.append(_chk("audio_loudness", "fail", "could not measure loudness"))
    sil = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-55dB:d=0.8",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    n_sil = len(re.findall(r"silence_start", sil))
    checks.append(_chk("no_dead_air", "pass" if n_sil == 0 else "fail", f"{n_sil} silent gap(s) > 0.8 s"))

    # 5 ── layout / text rules (from the render's layout report) ----------------------------------------
    sx0, sy0, sx1, sy1 = layout["safe"]
    ov = layout["overlays"]
    outside = [o for o in ov if o["box"][0] < sx0 - 2 or o["box"][1] < sy0 - 2 or o["box"][2] > sx1 + 2 or o["box"][3] > sy1 + 2]
    checks.append(_chk("text_inside_platform_safe_zone", "pass" if not outside else "fail",
                       f"{len(ov)} text elements checked against {platform_key} safe box {layout['safe']}" +
                       ("" if not outside else " | outside: " + ", ".join(o["text"][:24] for o in outside))))
    mins = {"hook": 100, "caption": 64, "chip": 50, "endcard-main": 100, "endcard-sub": 56}
    small = [f"{o['role']} '{o['text'][:20]}' {o['font_px']}px" for o in ov if o["role"] in mins and o["font_px"] < mins[o["role"]]]
    checks.append(_chk("subtitle_font_size", "pass" if not small else "fail",
                       "min sizes " + str({k: min([o['font_px'] for o in ov if o['role'] == k] or [0]) for k in mins}) +
                       ("" if not small else " | too small: " + "; ".join(small))))
    fast = []
    for o in ov:
        if o["role"] in ("hook", "caption") and o["words"]:
            wps = o["words"] / max(o["t1"] - o["t0"], 0.01)
            if wps > (3.6 if o["role"] == "hook" else 4.0):
                fast.append(f"{o['text'][:24]} {wps:.1f} w/s")
    checks.append(_chk("subtitle_reading_speed", "pass" if not fast else "fail",
                       "all on-screen text stays ≤ 4 words/s" if not fast else "too fast: " + "; ".join(fast)))

    # overlap of text boxes with the key gameplay regions registered per source
    worst, worst_info = 0.0, ""
    for s in layout["focus_samples"]:
        if s["in_transition"] or not s["focus"]:
            continue
        for o in ov:
            if o["role"] not in ("caption", "chip") or not (o["t0"] + 0.4 <= s["t"] < o["t1"] - 0.2):
                continue
            bx0, by0, bx1, by1 = o["box"]
            for f in s["focus"]:
                fx0, fy0, fx1, fy1 = [max(0, f[0]), max(0, f[1]), min(1080, f[2]), min(1920, f[3])]
                fa = max(1.0, (fx1 - fx0) * (fy1 - fy0))
                iw = max(0, min(bx1, fx1) - max(bx0, fx0))
                ih = max(0, min(by1, fy1) - max(by0, fy0))
                cov = iw * ih / fa
                if cov > worst:
                    worst, worst_info = cov, f"'{o['text'][:24]}' @ {s['t']}s covers {cov:.0%} of the key area of {layout['scenes'][s['scene']]['source']}"
    status = "pass" if worst <= 0.18 else "warn" if worst <= 0.30 else "fail"
    checks.append(_chk("text_vs_gameplay_overlap", status,
                       f"worst case: {worst_info or 'no overlap'} (warn >18%, fail >30%)"))

    # 6 ── pixel checks on sampled frames -------------------------------------------------------------
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={SAMPLE_FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    pr = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    fsize = W * H * 3
    black_hits = {"top": 0, "bottom": 0, "left": 0, "right": 0}
    n_game = 0
    contrast = []
    want = {}
    for o in ov:
        if o["role"] in ("hook", "caption", "chip"):
            tm = o["t1"] - 0.55 if o["t1"] - o["t0"] > 1.6 else (o["t0"] + o["t1"]) / 2
            want.setdefault(int(round(tm * SAMPLE_FPS)), []).append(o)
    i = 0
    while True:
        buf = pr.stdout.read(fsize)
        if len(buf) < fsize:
            break
        fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t = i / SAMPLE_FPS
        if t < layout["end_start"] - 0.1:
            n_game += 1
            strips = {"top": fr[:6], "bottom": fr[-6:], "left": fr[:, :6], "right": fr[:, -6:]}
            for k, st in strips.items():
                lum = st.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
                if lum.mean() < 12 and lum.std() < 4:
                    black_hits[k] += 1
        for o in want.get(i, []):
            x0, y0, x1, y1 = [int(round(c)) for c in o["box"]]
            crop = fr[max(0, y0):y1, max(0, x0):x1]
            lum_s = crop.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32) / 255.0
            L = _rel_lum(crop)
            if o["role"] == "chip":
                bg = L[lum_s > 0.5]
                ratio = (np.median(bg) + 0.05) / (0.012 + 0.05) if bg.size else 0
            else:
                bg = L[lum_s < 0.5]
                ratio = 1.05 / (np.median(bg) + 0.05) if bg.size else 21
            contrast.append((ratio, o["role"], o["text"][:24], round(t, 2)))
        i += 1
    pr.stdout.close()
    pr.wait()
    worst_edge = max(black_hits.values()) / max(n_game, 1)
    checks.append(_chk("no_black_borders", "pass" if worst_edge < 0.2 else "fail",
                       f"edge strips of {n_game} sampled gameplay frames: " + ", ".join(f"{k} {v}" for k, v in black_hits.items()) + " black"))
    if contrast:
        lowest = min(contrast)
        need = 3.0
        checks.append(_chk("subtitle_contrast", "pass" if lowest[0] >= need else "fail",
                           f"{len(contrast)} text blocks measured on real frames, lowest {lowest[0]:.1f}:1 "
                           f"('{lowest[2]}' {lowest[1]} @ {lowest[3]}s); need ≥ {need}:1 (large text)"))
    else:
        checks.append(_chk("subtitle_contrast", "fail", "no text block could be sampled"))
    return {"status": "fail" if any(c["status"] == "fail" for c in checks) else
            ("warn" if any(c["status"] == "warn" for c in checks) else "pass"),
            "checks": checks, "probe": info}
