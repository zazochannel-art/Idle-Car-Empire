"""Gameplay source registry (config/sources.json): every image/clip a video may use must be registered here
with provenance, which is what the 'real gameplay' QC check verifies."""
import hashlib
import json
from datetime import date

from .paths import CONFIG, ROOT

REG = CONFIG / "sources.json"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load():
    if REG.exists():
        return json.loads(REG.read_text(encoding="utf-8"))
    return {"_comment": "", "sources": {}}


def register(sid, path, stype, origin, description, focus=None, real=True, tags=None, overwrite=False):
    reg = load()
    p = (ROOT / path).resolve()
    if not p.exists():
        raise SystemExit(f"File not found: {p}")
    if sid in reg["sources"] and not overwrite:
        raise SystemExit(f"Source '{sid}' already registered (use --overwrite to replace)")
    reg["sources"][sid] = {
        "path": str(path).replace("\\", "/"),
        "type": stype,
        "real": bool(real),
        "origin": origin,
        "description": description,
        "sha256": sha256(p),
        "registered": date.today().isoformat(),
        "focus": focus or [],
        "tags": tags or [],
    }
    REG.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return reg["sources"][sid]
