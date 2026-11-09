"""Config loading + validation. All JSON lives in config/."""
import json
from pathlib import Path

from .paths import CONFIG, VIDEOS, ROOT


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def brand():
    return load_json(CONFIG / "brand.json")


def platforms():
    return load_json(CONFIG / "platforms.json")


def sources():
    return load_json(CONFIG / "sources.json")["sources"]


def video_files():
    return sorted(VIDEOS.glob("video-*.json"))


def load_video(ref):
    """ref: '01', '1', 'video-01', a slug, or a path to a spec file."""
    p = Path(ref)
    if p.suffix == ".json" and p.exists():
        return load_json(p)
    ref = str(ref)
    for f in video_files():
        spec = load_json(f)
        if ref in (spec["id"], spec["id"].lstrip("0"), f.stem, spec["slug"]):
            return spec
    raise SystemExit(f"Unknown video '{ref}'. Available: " + ", ".join(f.stem for f in video_files()))


CATEGORY_RANGES = {"short": (15, 20), "standard": (20, 30), "trailer": (30, 45)}


def scene_overlap(scene, default=0.3):
    if scene.get("transition", "cut") == "cut":
        return 0.0
    return float(scene.get("transition_dur", default))


def video_duration(spec):
    """Total length in seconds: scenes minus transition overlaps, plus the end card."""
    total = 0.0
    scenes = spec["scenes"]
    for i, s in enumerate(scenes):
        total += s["dur"]
        if i > 0:
            total -= scene_overlap(s)
    end = spec["endcard"]
    total += end["dur"] - scene_overlap(end)
    return round(total, 3)


def validate_video(spec):
    problems = []
    for key in ("id", "slug", "title", "category", "hooks", "endings", "captions", "scenes", "endcard", "music",
                "descriptions", "hashtags"):
        if key not in spec:
            problems.append(f"missing '{key}'")
    if problems:
        return problems
    if len(spec["hooks"]) != 3:
        problems.append("need exactly 3 hooks")
    if len(spec["endings"]) != 3:
        problems.append("need 3 endings (1 main + 2 alternatives)")
    if len(spec["captions"]) != 2:
        problems.append("need 2 caption variations")
    for k, caps in spec["captions"].items():
        if len(caps) != len(spec["scenes"]):
            problems.append(f"caption set {k} has {len(caps)} entries for {len(spec['scenes'])} scenes")
    for p in ("tiktok", "youtube_shorts", "instagram"):
        if p not in spec["descriptions"]:
            problems.append(f"missing description '{p}'")
    lo, hi = CATEGORY_RANGES[spec["category"]]
    d = video_duration(spec)
    if not lo <= d <= hi:
        problems.append(f"duration {d}s outside {spec['category']} range {lo}-{hi}s")
    return problems
