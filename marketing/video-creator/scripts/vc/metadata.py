"""Metadata JSON written next to every exported video."""
import platform as _platform
import subprocess
from datetime import datetime, timezone

import PIL

from .config import video_duration


def _tool_versions():
    try:
        ff = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    except Exception:
        ff = "unknown"
    return {"ffmpeg": ff, "python": _platform.python_version(), "pillow": PIL.__version__}


def build(spec, platform_key, plat, variant, layout, qc, brand, rendered_file, cmd, warnings, sources):
    cap_key = variant["captions"]
    hook_i, end_i = variant["hook"], variant["ending"]
    desc = spec["descriptions"]
    tags = spec["hashtags"]
    pk = {"tiktok": "tiktok", "youtube-shorts": "youtube_shorts", "instagram-reels": "instagram"}[platform_key]
    used = sorted({s["source"] for s in layout["scenes"][:-1]})
    return {
        "video_id": spec["id"],
        "slug": spec["slug"],
        "title": spec["title"],
        "category": spec["category"],
        "platform": platform_key,
        "file": rendered_file,
        "game": {"name": brand["name"], "play_url": brand["play_url"], "slogan": brand["slogan"]},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tools": _tool_versions(),
        "rendered_variant": {
            "hook": {"index": hook_i + 1, "text": spec["hooks"][hook_i].replace("**", "")},
            "ending": {"index": end_i + 1, "text": spec["endings"][end_i]["text"].replace("**", "")},
            "captions": {"set": cap_key, "lines": [c.replace("**", "") if c else None for c in spec["captions"][cap_key]]},
        },
        "variants": {
            "hooks": [h.replace("**", "") for h in spec["hooks"]],
            "alternative_endings": [e["text"].replace("**", "") for e in spec["endings"]],
            "caption_variations": {k: [c.replace("**", "") if c else None for c in v] for k, v in spec["captions"].items()},
            "render_another_variant": f"python scripts/render.py {spec['id']} --platform {platform_key} --hook 2 --ending 2 --captions B",
        },
        "description": desc[pk],
        "descriptions": {"tiktok": desc["tiktok"], "youtube_shorts": desc["youtube_shorts"], "instagram": desc["instagram"]},
        "hashtags": {"platform": tags["common"] + tags[pk], "common": tags["common"],
                     "tiktok": tags["tiktok"], "youtube_shorts": tags["youtube_shorts"], "instagram": tags["instagram"]},
        "post_text": desc[pk] + "\n\n" + " ".join(tags["common"] + tags[pk]),
        "safe_zone_px": plat["safe"],
        "footage": {
            "sources_used": used,
            "provenance": {sid: {"origin": sources[sid]["origin"], "type": sources[sid]["type"],
                                 "description": sources[sid]["description"]} for sid in used},
            "notes": warnings,
            "statement": "Built only from registered real in-game captures; no gameplay or feature is simulated.",
        },
        "ffmpeg_command": cmd,
        "layout": {"scenes": layout["scenes"], "text_elements": layout["overlays"]},
        "qc": qc,
    }
