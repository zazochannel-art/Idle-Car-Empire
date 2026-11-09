#!/usr/bin/env python3
"""Scaffold a new video spec from templates/video-template.json.

  python scripts/new_video.py 07 my-new-idea "My New Idea" --category short
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vc.paths import ASSETS, VIDEOS  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("id")
    ap.add_argument("slug")
    ap.add_argument("title")
    ap.add_argument("--category", choices=["short", "standard", "trailer"], default="standard")
    a = ap.parse_args()
    spec = json.loads((ASSETS / "templates" / "video-template.json").read_text(encoding="utf-8"))
    spec.update({"id": a.id, "slug": a.slug, "title": a.title, "category": a.category})
    out = VIDEOS / f"video-{a.id}.json"
    if out.exists():
        sys.exit(f"{out} already exists – refusing to overwrite")
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"created {out}\nEdit it, then: python scripts/preview.py {a.id} && python scripts/render.py {a.id}")


if __name__ == "__main__":
    main()
