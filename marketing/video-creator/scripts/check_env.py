#!/usr/bin/env python3
"""Checks that this machine can run the pipeline and reports which recordings are still missing."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vc import config as C  # noqa: E402
from vc.paths import CONFIG, FONTS, LOGOS, REPO  # noqa: E402
from vc.scenes import source_path  # noqa: E402

OK, BAD = "✓", "✗"
problems = 0


def line(ok, msg, hint=""):
    global problems
    print(f"  {OK if ok else BAD} {msg}" + ("" if ok else f"\n      → {hint}"))
    problems += 0 if ok else 1


print("Python / packages")
line(sys.version_info >= (3, 9), f"Python {sys.version.split()[0]}", "install Python 3.9+")
for mod, pip in (("PIL", "Pillow"), ("numpy", "numpy")):
    try:
        m = __import__(mod)
        line(True, f"{pip} {getattr(m, '__version__', '')}")
    except ImportError:
        line(False, f"{pip} missing", f"pip install {pip}   (or: pip install -r requirements.txt)")
for mod in ("moviepy", "cv2"):
    try:
        __import__(mod)
        print(f"  · optional {mod}: installed (not required)")
    except ImportError:
        print(f"  · optional {mod}: not installed (not required)")

print("FFmpeg")
for tool in ("ffmpeg", "ffprobe"):
    line(shutil.which(tool) is not None, tool, "install FFmpeg: Windows `winget install Gyan.FFmpeg`, macOS `brew install ffmpeg`, Linux `sudo apt install ffmpeg`")
if shutil.which("ffmpeg"):
    enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    line("libx264" in enc, "libx264 encoder", "use an FFmpeg build with libx264 (the gyan.dev / Homebrew / apt builds have it)")
    line(" aac " in enc, "aac encoder", "use a full FFmpeg build")
    flt = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    line("loudnorm" in flt and "ebur128" in flt, "loudnorm + ebur128 filters", "FFmpeg 4.4 or newer is needed")

print("Assets")
for w in ("Black", "ExtraBold", "Bold"):
    line((FONTS / f"BarlowCondensed-{w}.ttf").exists(), f"font BarlowCondensed-{w}.ttf", "see assets/fonts/README.md")
line((LOGOS / "logo-cutout.png").exists() or (REPO / "assets" / "logo-cutout.webp").exists(), "game logo (logo-cutout)", "put your logo at assets/logos/logo-cutout.png (transparent PNG)")
print(f"  · Google Play badge: {'found – used on the end card' if (LOGOS / 'google-play-badge.png').exists() else 'not found (a plain text button is drawn; drop the official badge at assets/logos/google-play-badge.png to use it)'}")

print("Gameplay sources (config/sources.json)")
reg = C.sources()
for sid, e in reg.items():
    line(source_path(e).exists(), f"{sid} [{e['type']}{'' if e.get('real') else ', NOT REAL'}] {e['path']}", "file missing")

print("Recordings still wanted (config/recording-wishlist.json)")
wl = C.load_json(CONFIG / "recording-wishlist.json")["clips"]
missing = [k for k in wl if k not in reg]
for k in wl:
    print(f"  {'✓ registered' if k in reg else '· missing   '} clip:{k:24s} ~{wl[k]['seconds']:>2}s  used by videos {', '.join(wl[k]['used_by'])}")
print(f"  {len(missing)} of {len(wl)} clips missing – scenes use real screenshots as fallback meanwhile")

print("\nVideo specs")
for f in C.video_files():
    s = C.load_json(f)
    pr = C.validate_video(s)
    line(not pr, f"{f.stem}: {s['title']} ({C.video_duration(s)}s, {s['category']})", "; ".join(pr))

print("\n" + ("Environment OK." if not problems else f"{problems} problem(s) found."))
sys.exit(1 if problems else 0)
