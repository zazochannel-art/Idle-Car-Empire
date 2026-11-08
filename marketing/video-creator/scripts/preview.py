#!/usr/bin/env python3
"""Render still frames (contact sheet) of a video to eyeball layout before a full render.

  python scripts/preview.py 01 --platform tiktok --times 0.5,2,5,9 --out /tmp/preview.png
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageDraw  # noqa: E402

from vc import build, config as C  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--platform", default="tiktok")
    ap.add_argument("--times", default="0.6,2.0,4.0,6.0,9.0,12.0,16.0,20.0")
    ap.add_argument("--out", default="preview.png")
    ap.add_argument("--hook", type=int, default=1)
    ap.add_argument("--ending", type=int, default=1)
    ap.add_argument("--captions", default="A")
    ap.add_argument("--safe", action="store_true", help="draw the platform safe-zone rectangle")
    ap.add_argument("--scale", type=float, default=0.4)
    a = ap.parse_args()
    spec = C.load_video(a.video)
    tl = build.make_timeline(spec, a.platform, build.variant_from_args(a.hook, a.ending, a.captions))
    times = [float(x) for x in a.times.split(",")]
    frames = []
    for t in times:
        t = min(t, tl.duration - 0.05)
        im = tl.render_frame(int(round(t * tl.fps)))
        if a.safe:
            d = ImageDraw.Draw(im)
            d.rectangle(tl.safe, outline=(255, 0, 255), width=4)
        frames.append((t, im))
    w, h = int(frames[0][1].width * a.scale), int(frames[0][1].height * a.scale)
    cols = min(len(frames), 4)
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
    for i, (t, im) in enumerate(frames):
        sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
        ImageDraw.Draw(sheet).text(((i % cols) * w + 6, (i // cols) * h + 6), f"{t:.2f}s", fill=(255, 255, 0))
    sheet.save(a.out)
    print(f"{spec['title']} [{a.platform}] {tl.duration}s → {a.out}")
    for w_ in tl.warnings:
        print("warning:", w_)
    tl.close()


if __name__ == "__main__":
    main()
