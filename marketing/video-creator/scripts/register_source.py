#!/usr/bin/env python3
"""Register a real gameplay recording/screenshot so videos can use it.

  python scripts/register_source.py assets/gameplay/clips/factory-interior.mp4 --id factory-interior --real \
      --description "Inside the Car Assembly Plant, slow pan" --origin "Screen recording on Pixel 8, game v1.1.1"

The --real flag is your statement that the file is an unedited capture of the actual game.
Optional --focus x0,y0,x1,y1 (0-1, repeatable) marks the key gameplay area that captions must avoid.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vc import registry  # noqa: E402
from vc.paths import ROOT  # noqa: E402

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path")
    ap.add_argument("--id", required=True)
    ap.add_argument("--real", action="store_true", help="confirm this is a genuine, unmodified in-game capture")
    ap.add_argument("--origin", default="Screen recording of the game")
    ap.add_argument("--description", required=True)
    ap.add_argument("--focus", action="append", default=[], help="x0,y0,x1,y1 normalised; repeatable")
    ap.add_argument("--overwrite", action="store_true")
    a = ap.parse_args()
    if not a.real:
        sys.exit("Refusing to register: pass --real to confirm this is genuine gameplay (the pipeline never fabricates gameplay).")
    p = Path(a.path).resolve()
    if not p.exists():
        sys.exit(f"not found: {p}")
    rel = os.path.relpath(p, ROOT).replace("\\", "/")
    stype = "clip" if p.suffix.lower() in VIDEO_EXT else "screenshot"
    if stype == "clip":
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
                            "-of", "json", str(p)], capture_output=True, text=True)
        j = json.loads(r.stdout)
        w, h = j["streams"][0]["width"], j["streams"][0]["height"]
        print(f"clip: {w}x{h}, {float(j['format']['duration']):.1f}s")
        if w > h:
            print("warning: landscape clip – it will be centre-cropped to 9:16")
        if min(w, h) < 720:
            print("warning: low resolution; the video will look soft")
    focus = [[float(x) for x in f.split(",")] for f in a.focus]
    e = registry.register(a.id, rel, stype, a.origin, a.description, focus, True, [], a.overwrite)
    print(f"registered '{a.id}' ({stype}) sha256 {e['sha256'][:12]}…")


if __name__ == "__main__":
    main()
