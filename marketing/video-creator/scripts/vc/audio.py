"""Procedural (copyright-free) music + sound effects, synthesised with numpy.

Everything here is generated from maths, so there is no third-party audio and nothing to license.
You can also drop your own licensed track in assets/music/<preset>.(wav|mp3|m4a|ogg) or your own SFX in
assets/sound-effects/<name>.wav – files in assets/ always win over the synthesised versions.
"""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

from .paths import MUSIC, SFX, CACHE

SR = 48000

# ------------------------------------------------------------------------------------------------
# small DSP helpers


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_exp(n, decay, attack=0.004):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def add(buf, sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= len(buf) or i + len(sig) <= 0:
        return
    j = min(len(buf), i + len(sig))
    seg = sig[: j - i] * gain
    l, r = (1 - max(0, pan)), (1 + min(0, pan))
    buf[i:j, 0] += seg * l
    buf[i:j, 1] += seg * r


def saw_add(freq, n, harmonics=7):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if freq * k > 9000:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * 0.6


def sq_add(freq, n, harmonics=6):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics * 2, 2):
        if freq * k > 9000:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * 0.8


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def highpass_diff(x, k=1):
    y = x.copy()
    for _ in range(k):
        y = np.concatenate([[0], np.diff(y)])
    return y


def sweep_noise(n, f0, f1, width=0.35, seed=1):
    """Band-pass noise whose centre frequency glides f0 -> f1 (STFT synthesis)."""
    hop, win = 512, 1024
    nfr = n // hop + 2
    w = np.hanning(win)
    out = np.zeros(nfr * hop + win)
    rng = np.random.default_rng(seed)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    for i in range(nfr):
        fc = f0 * (f1 / f0) ** (i / max(nfr - 1, 1))
        mag = np.exp(-((np.log2(np.maximum(freqs, 1) / fc)) / width) ** 2)
        spec = mag * np.exp(1j * rng.uniform(0, 2 * np.pi, len(freqs)))
        frame = np.fft.irfft(spec, win) * w
        out[i * hop: i * hop + win] += frame
    out = out[:n]
    return out / (np.max(np.abs(out)) + 1e-9)


# ------------------------------------------------------------------------------------------------
# sound effects (mono arrays, peak ≈ 1)


def sfx_whoosh():
    n = int(0.55 * SR)
    s = sweep_noise(n, 300, 5200, 0.8, seed=3)
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.6
    return s * env


def sfx_hit():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 42 + 130 * np.exp(-t * 22)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.22, 0.001)
    click = highpass_diff(noise(n, 5), 2) * env_exp(n, 0.02, 0.0005) * 0.12
    return np.tanh(1.6 * (body + click)) * 0.9


def sfx_impact():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = 38 + 90 * np.exp(-t * 14)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.55, 0.001)
    air = sweep_noise(n, 5000, 400, 0.9, seed=9) * env_exp(n, 0.5, 0.002) * 0.35
    return np.tanh(1.4 * (body + air)) * 0.9


def sfx_slam():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 55 + 160 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.16, 0.001)
    crack = highpass_diff(noise(n, 11), 1) * env_exp(n, 0.045, 0.0004) * 0.1
    return np.tanh(1.8 * (body + crack)) * 0.9


def sfx_tick():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + np.sin(2 * np.pi * 3400 * t) * 0.2) * env_exp(n, 0.018, 0.0005)


def sfx_pop():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = 500 + 700 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.05, 0.001) * 0.9


def sfx_blip():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * 988 * t) + 0.5 * np.sin(2 * np.pi * 1480 * t)
    return s * env_exp(n, 0.07, 0.002) * 0.55


def sfx_riser():
    n = int(1.3 * SR)
    s = sweep_noise(n, 250, 7000, 0.7, seed=21)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / t[-1]) ** 2) / SR) * 0.25
    env = (np.linspace(0, 1, n) ** 2.2)
    return (s * 0.8 + tone) * env


def sfx_chime():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, a, d in ((1175, 1.0, 0.9), (1760, 0.6, 0.7), (2349, 0.4, 0.5), (3520, 0.18, 0.3)):
        out += a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
    return out * 0.45 * np.minimum(1, t / 0.003)


SFX_BUILDERS = {"whoosh": sfx_whoosh, "hit": sfx_hit, "impact": sfx_impact, "slam": sfx_slam, "tick": sfx_tick,
                "pop": sfx_pop, "blip": sfx_blip, "riser": sfx_riser, "chime": sfx_chime}


def read_audio_file(path):
    """Decode any audio file to float32 stereo @48k via FFmpeg."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def get_sfx(name):
    for ext in ("wav", "mp3", "ogg", "m4a"):
        p = SFX / f"{name}.{ext}"
        if p.exists():
            return read_audio_file(p).mean(axis=1)
    return SFX_BUILDERS[name]()


# ------------------------------------------------------------------------------------------------
# music

PRESETS = {
    # bpm, root midi (bass octave), chord progression as semitone offsets of triads (minor/major), energy plan
    "drive":    {"bpm": 122, "root": 45, "prog": [(0, "m"), (-4, "M"), (-2, "M"), (-5, "M")], "arp": True, "kick": "four", "dark": 0.0},
    "epic":     {"bpm": 96,  "root": 38, "prog": [(0, "m"), (-4, "M"), (-7, "M"), (-2, "M")], "arp": True, "kick": "half", "dark": 0.5},
    "satisfy":  {"bpm": 104, "root": 48, "prog": [(0, "M"), (-3, "m"), (-7, "M"), (-5, "M")], "arp": True, "kick": "soft", "dark": -0.3},
    "energy":   {"bpm": 128, "root": 40, "prog": [(0, "m"), (-2, "M"), (-4, "M"), (-2, "M")], "arp": True, "kick": "four", "dark": 0.2},
}


def _triad(root, kind):
    return [root, root + (3 if kind == "m" else 4), root + 7]


def synth_music(preset_name, duration, bpm=None, seed=1):
    p = PRESETS[preset_name]
    bpm = bpm or p["bpm"]
    beat = 60.0 / bpm
    n = int((duration + 1.0) * SR)
    buf = np.zeros((n, 2))
    rng = np.random.default_rng(seed)
    bars = int(np.ceil((duration + 1) / (beat * 4)))
    kick_times, pads = [], []
    kick = sfx_hit()[: int(0.35 * SR)] * 0.9
    snare_n = int(0.22 * SR)
    for bar in range(bars):
        b0 = bar * 4 * beat
        off, kind = p["prog"][bar % len(p["prog"])]
        root = p["root"] + off
        chord = _triad(root + 24, kind)
        intro = bar == 0
        # kick
        pat = {"four": [0, 1, 2, 3], "half": [0, 2], "soft": [0, 2.5]}[p["kick"]]
        for k in pat:
            if intro and k not in (0,):
                continue
            kick_times.append(b0 + k * beat)
            add(buf, kick, b0 + k * beat, 0.8 if not intro else 0.6)
        # clap / snare on 2 and 4 (from bar 1)
        if bar >= 1 and p["kick"] != "soft":
            for k in (1, 3):
                s = sweep_noise(snare_n, 1800, 1500, 1.2, seed=bar * 7 + k) * env_exp(snare_n, 0.07, 0.001)
                s += np.sin(2 * np.pi * 190 * np.arange(snare_n) / SR) * env_exp(snare_n, 0.05, 0.001) * 0.4
                add(buf, s, b0 + k * beat, 0.30)
        # hats
        if bar >= 1:
            hn = int(0.05 * SR)
            hat = highpass_diff(noise(hn, 3), 2) * env_exp(hn, 0.012, 0.0004)
            hat /= np.max(np.abs(hat)) + 1e-9
            for k in range(8):
                add(buf, hat, b0 + (k + 0.5) * beat / 2 * 1.0, 0.16 if k % 2 else 0.1)
        # bass: eighth-note pulse on the root
        bn = int(beat * 0.5 * SR)
        for k in range(8):
            if bar == 0 and k > 0:
                break
            sig = saw_add(mtof(root), bn, 6) * env_exp(bn, 0.16, 0.004)
            sig += np.sin(2 * np.pi * mtof(root) * np.arange(bn) / SR) * env_exp(bn, 0.2, 0.004) * 0.8
            add(buf, sig, b0 + k * beat / 2, 0.34 if k % 2 == 0 else 0.24)
        # pad (detuned additive saws), sidechained later
        pn = int(4 * beat * SR) + int(0.3 * SR)
        pad = np.zeros(pn)
        for m in chord:
            for det in (-0.004, 0.0, 0.004):
                pad += saw_add(mtof(m) * (1 + det), pn, 4)
        t_ = np.arange(pn) / SR
        pad *= np.minimum(1, t_ / 0.25) * np.minimum(1, (pn / SR - t_) / 0.35)
        pads.append((b0, pad, 0.035 if bar < 1 else 0.05))
        # arp (16ths) from bar 1
        if p["arp"] and bar >= 1:
            notes = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[1]]
            an = int(beat * 0.6 * SR)
            for k in range(16):
                m = notes[k % len(notes)] + (12 if (bar % 4 == 3 and k >= 8) else 0)
                sig = sq_add(mtof(m), an, 4) * env_exp(an, 0.09, 0.002)
                add(buf, sig, b0 + k * beat / 4, 0.055, pan=(-0.5 if k % 2 else 0.5))
    # sidechain-ducked pads
    duck = np.ones(n)
    for kt in kick_times:
        i = int(kt * SR)
        m = min(n, i + int(0.35 * SR))
        tt = np.arange(m - i) / SR
        duck[i:m] = np.minimum(duck[i:m], 1 - 0.65 * np.exp(-tt / 0.11))
    padmix = np.zeros((n, 2))
    for b0, pad, g in pads:
        add(padmix, pad, b0, g)
    buf += padmix * duck[:, None]
    # gentle limiter + trim
    buf = np.tanh(buf)
    out = buf[: int(duration * SR)]
    fade = int(0.5 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out


def get_music(preset, duration, bpm=None, seed=1):
    for ext in ("wav", "mp3", "m4a", "ogg"):
        pth = MUSIC / f"{preset}.{ext}"
        if pth.exists():
            m = read_audio_file(pth)
            if len(m) < duration * SR:
                m = np.tile(m, (int(np.ceil(duration * SR / len(m))), 1))
            out = m[: int(duration * SR)].copy()
            fade = int(0.6 * SR)
            out[-fade:] *= np.linspace(1, 0, fade)[:, None]
            return out
    return synth_music(preset, duration, bpm, seed)


# ------------------------------------------------------------------------------------------------
# mix + loudness


def write_wav(path, x):
    peak = float(np.abs(x).max())
    if peak > 0.95:
        x = x * (0.95 / peak)   # loudnorm re-levels afterwards; this only prevents clipping
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def mix(duration, events, music_preset, bpm=None, seed=1, music_gain=0.55, sfx_gain=0.8):
    n = int(duration * SR)
    music = get_music(music_preset, duration, bpm, seed)
    buf = np.zeros((n, 2))
    buf[: len(music)] += music[:n] * music_gain
    cache = {}
    # duck music slightly under big SFX
    duck = np.ones(n)
    for t, name, g in events:
        if name not in cache:
            cache[name] = get_sfx(name)
        sig = cache[name]
        if sig.ndim == 2:
            sig = sig.mean(axis=1)
        add(buf, sig, t, g * sfx_gain, pan=0.0)
        if name in ("impact", "slam", "hit", "whoosh", "riser"):
            i = int(max(0, t) * SR)
            m = min(n, i + int(0.45 * SR))
            if m > i:
                duck[i:m] = np.minimum(duck[i:m], 0.72)
    # smooth the ducking curve
    k = int(0.05 * SR)
    duck = np.convolve(duck, np.ones(k) / k, mode="same")
    mus = np.zeros((n, 2))
    mus[: len(music)] = music[:n] * music_gain
    sfx_only = buf - mus
    out = mus * duck[:, None] + sfx_only
    return out


def loudnorm(in_wav, out_wav, target_lufs=-14.0, tp=-1.5, lra=9.0):
    """Two-pass EBU R128 normalisation with FFmpeg's loudnorm filter."""
    flt = f"loudnorm=I={target_lufs}:TP={tp}:LRA={lra}"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(in_wav), "-af", flt + ":print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    js = json.loads(txt[txt.rindex("{"): txt.rindex("}") + 1])
    flt2 = (f"{flt}:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
            f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true,"
            # safety true-peak ceiling: AAC encoding adds ~0.5 dB of overshoot, so keep ~4 dB of headroom
            f"alimiter=limit=0.63:attack=3:release=60:level=disabled")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(in_wav), "-af", flt2, "-ar", str(SR), "-ac", "2",
                    "-c:a", "pcm_s16le", str(out_wav)], check=True)
    return js


def render_audio(key, duration, events, preset, bpm, seed, target_lufs, tp):
    CACHE.mkdir(parents=True, exist_ok=True)
    raw = CACHE / f"{key}.raw.wav"
    final = CACHE / f"{key}.wav"
    mixed = mix(duration, events, preset, bpm, seed)
    write_wav(raw, mixed)
    stats = loudnorm(raw, final, target_lufs, tp)
    return final, stats
