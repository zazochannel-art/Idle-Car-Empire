"""Shared helper: construct a Timeline for (video, platform, variant)."""
from . import config as C
from .timeline import Timeline


def variant_from_args(hook=1, ending=1, captions="A"):
    return {"hook": int(hook) - 1, "ending": int(ending) - 1, "captions": str(captions).upper()}


def variant_suffix(v):
    if v == {"hook": 0, "ending": 0, "captions": "A"}:
        return ""
    return f"_h{v['hook'] + 1}e{v['ending'] + 1}c{v['captions']}"


def make_timeline(spec, platform_key, variant):
    pf = C.platforms()
    plat = dict(pf["platforms"][platform_key])
    d = pf["defaults"]
    return Timeline(spec, platform_key, plat, C.brand(), C.sources(), variant, d["width"], d["height"], d["fps"])
