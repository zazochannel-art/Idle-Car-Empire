#!/usr/bin/env python3
"""Render promo videos for TikTok, YouTube Shorts and Instagram Reels, then run QC.

  python scripts/render.py all                       # every video, every platform (18 files)
  python scripts/render.py 06 --platform tiktok      # one video, one platform
  python scripts/render.py 01 --hook 2 --ending 3 --captions B      # content variant
  python scripts/render.py 01 --jobs 4               # parallel renders

Exit code is non-zero if any export or any QC check fails.
"""
import argparse
import hashlib
import json
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vc import audio, build, config as C, encode, metadata, qc  # noqa: E402
from vc.paths import OUTPUT, CACHE  # noqa: E402

PLATFORMS = ["tiktok", "youtube-shorts", "instagram-reels"]


def _audio_key(spec, variant, tl):
    h = hashlib.sha1(json.dumps([spec["music"], variant, tl.duration, tl.events], sort_keys=True, default=str).encode()).hexdigest()[:12]
    return f"v{spec['id']}_{h}"


def prepare_audio(spec, variant, defaults):
    tl = build.make_timeline(spec, "tiktok", variant)
    key = _audio_key(spec, variant, tl)
    final = CACHE / f"{key}.wav"
    if not final.exists():
        m = spec["music"]
        audio.render_audio(key, tl.duration, tl.events, m["preset"], m.get("bpm"), m.get("seed", 1),
                           defaults["loudness_target_lufs"], defaults["true_peak_db"])
    tl.close()
    return final


def render_one(video_id, platform_key, variant, audio_path, run_qc):
    t0 = time.time()
    spec = C.load_video(video_id)
    pf = C.platforms()
    d, plat = pf["defaults"], pf["platforms"][platform_key]
    tl = build.make_timeline(spec, platform_key, variant)
    out_dir = OUTPUT / plat["dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"video-{spec['id']}-{spec['slug']}{build.variant_suffix(variant)}"
    out = out_dir / f"{stem}.mp4"
    tmp = out_dir / f".{stem}.partial.mp4"
    brand = C.brand()
    cmd = encode.encode(tl, audio_path, tmp, d, title=f"{spec['title']} – {brand['name']}",
                        comment=brand["play_url"])
    tmp.replace(out)
    layout = tl.layout_report()
    tl.close()
    result = {"video": spec["id"], "platform": platform_key, "file": str(out), "seconds": round(time.time() - t0, 1)}
    qc_res = None
    if run_qc:
        qc_res = qc.run_qc(out, layout, spec, platform_key, plat, d, C.sources(), tl.duration)
    meta = metadata.build(spec, platform_key, plat, variant, layout, qc_res, brand, out.name, cmd, tl.warnings, C.sources())
    (out_dir / f"{stem}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    result["qc"] = None if qc_res is None else {"status": qc_res["status"],
                                                "failed": [c for c in qc_res["checks"] if c["status"] == "fail"],
                                                "warned": [c for c in qc_res["checks"] if c["status"] == "warn"]}
    return result


def _worker(args):
    try:
        return render_one(*args)
    except Exception:
        return {"video": args[0], "platform": args[1], "error": traceback.format_exc()}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", help="video ids (01..06), slugs or 'all'")
    ap.add_argument("--platform", choices=PLATFORMS + ["all"], default="all")
    ap.add_argument("--hook", type=int, default=1, choices=[1, 2, 3])
    ap.add_argument("--ending", type=int, default=1, choices=[1, 2, 3])
    ap.add_argument("--captions", default="A", choices=["A", "B"])
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--no-qc", action="store_true")
    a = ap.parse_args()

    ids = [C.load_video(f.stem)["id"] for f in C.video_files()] if a.videos == ["all"] else \
        [C.load_video(v)["id"] for v in a.videos]
    plats = PLATFORMS if a.platform == "all" else [a.platform]
    variant = build.variant_from_args(a.hook, a.ending, a.captions)
    d = C.platforms()["defaults"]

    for vid in ids:
        problems = C.validate_video(C.load_video(vid))
        if problems:
            sys.exit(f"video {vid} config problems: {problems}")
    print(f"Rendering {len(ids)} video(s) × {len(plats)} platform(s), variant {variant}")
    audios = {}
    for vid in ids:
        audios[vid] = prepare_audio(C.load_video(vid), variant, d)
        print(f"  audio ready for video {vid}")
    tasks = [(vid, p, variant, audios[vid], not a.no_qc) for vid in ids for p in plats]
    results = []
    with ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        futs = [ex.submit(_worker, t) for t in tasks]
        for f in as_completed(futs):
            r = f.result()
            results.append(r)
            if "error" in r:
                print(f"  ✗ video {r['video']} / {r['platform']}: EXPORT FAILED\n{r['error']}")
            else:
                q = r["qc"]
                flag = "…" if q is None else {"pass": "✓", "warn": "✓ (warnings)", "fail": "✗ QC FAILED"}[q["status"]]
                print(f"  {flag} video {r['video']} / {r['platform']} ({r['seconds']}s) → {Path(r['file']).name}")
                if q:
                    for c in q["failed"]:
                        print(f"      FAIL {c['name']}: {c['detail']}")
                    for c in q["warned"]:
                        print(f"      warn {c['name']}: {c['detail']}")
    bad = [r for r in results if "error" in r or (r["qc"] and r["qc"]["status"] == "fail")]
    report = OUTPUT / "last-run.json"
    report.write_text(json.dumps(sorted(results, key=lambda r: (r["video"], r["platform"])), indent=2) + "\n")
    print(f"\n{len(results) - len(bad)}/{len(results)} exports passed. Report: {report}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
