"""Builds the full timeline of one video (scenes, transitions, hook, captions, chips, end card, SFX events)
for one platform + one set of content variants, and renders any frame on demand."""
import hashlib

from PIL import Image, ImageChops

from . import easing as E
from . import transitions
from .config import scene_overlap, video_duration
from .paths import ROOT
from .scenes import (EndCard, FullScene, PhoneScene, brand_background, shine_sprite, source_path, vignette)
from .textfx import TextBlock, ACCENT, INK, parse_markup

CONTRAST_LUT = [int(255 * (0.5 + (i / 255 - 0.5) * 1.07)) for i in range(256)]
CONTRAST_LUT = [min(255, max(0, v)) for v in CONTRAST_LUT]


class ResolvedScene:
    def __init__(self, idx, spec, entry, source_id, used_fallback, start):
        self.idx, self.spec, self.entry = idx, spec, entry
        self.source_id, self.used_fallback = source_id, used_fallback
        self.start = start
        self.end = start + spec["dur"]
        self.overlap = scene_overlap(spec) if idx > 0 else 0.0
        self.obj = None


class Timeline:
    def __init__(self, spec, platform_key, platform, brand, sources, variant, W=1080, H=1920, fps=30):
        self.spec, self.platform_key, self.platform, self.brand = spec, platform_key, platform, brand
        self.W, self.H, self.fps = W, H, fps
        self.variant = variant
        self.sources = sources
        sz = platform["safe"]
        self.safe = (sz["left"], sz["top"], W - sz["right"], H - sz["bottom"])
        self.safe_w = self.safe[2] - self.safe[0]
        self.duration = video_duration(spec)
        self.frames = int(round(self.duration * fps))
        self.events = []       # audio events: (t, name, gain)
        self.overlays = []     # text overlays for rendering + QC
        self.warnings = []
        self.scenes = []
        self._build_scenes()
        self._build_overlays()
        self.vig = vignette(W, H)
        self.shine = shine_sprite(W, H)
        self._lut_cache = {}

    # ------------------------------------------------------------------ scenes
    def _resolve(self, s):
        for key in ("source", "fallback"):
            sid = s.get(key)
            if not sid:
                continue
            for cand in (sid, sid[5:] if sid.startswith("clip:") else sid):
                e = self.sources.get(cand)
                if e and source_path(e).exists():
                    return cand, e, key == "fallback"
        raise SystemExit(f"Scene source not available: {s.get('source')} (fallback {s.get('fallback')})")

    def _build_scenes(self):
        t = 0.0
        for i, s in enumerate(self.spec["scenes"]):
            if i > 0:
                t -= scene_overlap(s)
            sid, entry, fb = self._resolve(s)
            if fb:
                self.warnings.append(f"scene {i + 1}: preferred source '{s.get('source')}' not available, using '{sid}'")
            self.scenes.append(ResolvedScene(i, s, entry, sid, fb, t))
            t += s["dur"]
        end = dict(self.spec["endcard"])
        t -= scene_overlap(end)
        rs = ResolvedScene(len(self.scenes), end, None, "endcard", False, t)
        rs.overlap = scene_overlap(end)
        self.scenes.append(rs)
        self.end_start = t

    def _scene_obj(self, rs):
        if rs.obj is None:
            if rs.idx == len(self.scenes) - 1:
                ending = self.spec["endings"][self.variant["ending"]]
                rs.obj = EndCard(rs.spec, ending, self.platform, self.brand, self.W, self.H, self.fps)
            elif rs.spec.get("layout", "full") == "phone":
                rs.obj = PhoneScene(rs.spec, rs.entry, self.W, self.H, self.fps)
            else:
                rs.obj = FullScene(rs.spec, rs.entry, self.W, self.H, self.fps)
        return rs.obj

    # ------------------------------------------------------------------ overlays
    def _anchor_y(self, pos, h, top_extra=0):
        sx0, sy0, sx1, sy1 = self.safe
        if pos == "upper":
            return sy0 + 90 + top_extra
        if pos == "mid":
            return (sy0 + sy1) / 2 - h / 2
        return sy1 - 30 - h

    def _add(self, role, text, block, x, y, t0, t1, scene=None):
        self.overlays.append({"role": role, "text": text, "block": block, "x": x, "y": y, "t0": t0, "t1": t1,
                              "scene": scene})

    def _build_overlays(self):
        sx0, sy0, sx1, sy1 = self.safe
        spec = self.spec
        # hook (over scene 1)
        hook = spec["hooks"][self.variant["hook"]]
        hb = TextBlock(hook, weight="black", size=176, max_w=self.safe_w - 20, max_lines=4, style="slam",
                       stagger=0.17, anim_dur=0.24, line_gap=-0.06)
        nwords = len(hb.words)
        hook_t0 = 0.12
        self.hook_end = max(2.5, hook_t0 + hb.settle_time() + 1.1)
        hx = sx0 + (self.safe_w - hb.w) / 2
        hy = min(max(sy0 + (sy1 - sy0) * 0.36 - hb.h / 2, sy0 + 12), sy1 - hb.h - 12)
        self._add("hook", hook, hb, hx, hy, hook_t0, self.hook_end, 0)
        for i in range(nwords):
            self.events.append((hook_t0 + i * 0.17, "slam" if i == 0 else "tick", 0.9 if i == 0 else 0.55))
        # captions & chips
        cap_set = spec["captions"][self.variant["captions"]]
        for rs in self.scenes[:-1]:
            nxt = self.scenes[rs.idx + 1]
            t_end = nxt.start + 0.05
            cap = cap_set[rs.idx]
            first = rs.idx == 0
            c0 = (self.hook_end + 0.05) if first else rs.start + 0.35 + rs.overlap * 0.5
            if cap:
                cb = TextBlock(cap, weight="extrabold", size=92, max_w=self.safe_w - 120, max_lines=3, plate=True,
                               style="pop", stagger=0.06, anim_dur=0.28)
                pos = rs.spec.get("caption_pos", "lower")
                cx = sx0 + (self.safe_w - cb.w) / 2
                cy = self._anchor_y(pos, cb.h, 90 if rs.spec.get("chip") and pos == "upper" else 0)
                self._add("caption", cap, cb, cx, cy, c0, t_end, rs.idx)
                self.events.append((c0 + 0.02, "pop", 0.45))
            chip = rs.spec.get("chip")
            if chip:
                chb = TextBlock(chip, weight="black", size=60, max_w=self.safe_w - 120, max_lines=1,
                                color=INK, accent=INK, stroke_rel=0.0, shadow=False, plate=ACCENT + (255,),
                                plate_pad=(0.5, 0.2), style="slide", upper=True)
                cpos = rs.spec.get("chip_pos", "top")
                cy = sy0 + 10 if cpos == "top" else sy1 - chb.h - 10
                chx = sx0 + 10
                t0 = c0 + 0.55 if first else rs.start + 0.9
                self._add("chip", chip, chb, chx, cy, t0, t_end - 0.05, rs.idx)
                self.events.append((t0, "blip", 0.5))
        # transitions + scene hits
        for rs in self.scenes[1:]:
            name = rs.spec.get("transition", "cut")
            if name == "cut":
                self.events.append((rs.start, "hit", 0.6))
                continue
            self.events.append((rs.start - 0.04, "whoosh", 0.8 if name != "flash" else 0.55))
            self.events.append((rs.start + rs.overlap * 0.55, "hit", 0.8))
        # end card cues
        es = self.end_start
        ending = self.spec["endings"][self.variant["ending"]]
        self.events.append((max(0.0, es - 1.1), "riser", 0.7))
        self.events.append((es + 0.4, "impact", 0.9))
        words = len(parse_markup(ending["text"]))
        for i in range(words):
            self.events.append((es + 0.45 + i * 0.14, "tick", 0.6))
        end_obj = self._scene_obj(self.scenes[-1])
        btn_t = es + 0.45 + end_obj.main.settle_time() * 0.6 + 0.2
        self.events.append((btn_t + 0.05, "chime", 0.9))
        self.end_obj_boxes = None

    # ------------------------------------------------------------------ rendering
    def _grade(self, img):
        return img.point(CONTRAST_LUT * 3)

    def _active(self, t):
        """Return list of (ResolvedScene, local_t) and transition info for time t."""
        cur = None
        for rs in self.scenes:
            if rs.start <= t + 1e-9:
                cur = rs
        if cur.idx > 0 and t < cur.start + cur.overlap - 1e-9 and cur.overlap > 0:
            prev = self.scenes[cur.idx - 1]
            return prev, cur, (t - cur.start) / cur.overlap
        return None, cur, None

    def _release(self, t):
        for rs in self.scenes:
            if rs.obj is not None and t > rs.end + 0.05:
                rs.obj.close()
                rs.obj = None if rs.idx != len(self.scenes) - 1 else rs.obj

    def render_frame(self, f):
        t = f / self.fps
        prev, cur, p = self._active(t)
        b = self._scene_obj(cur).render(t - cur.start)
        if prev is not None:
            a = self._scene_obj(prev).render(t - prev.start)
            base = transitions.apply(cur.spec.get("transition", "cut"), a, b, p)
        else:
            base = b
        if cur.idx != len(self.scenes) - 1 or prev is not None:
            base = self._grade(base)
            base.paste((0, 0, 0), (0, 0), self.vig)
        img = base
        # shine accent at scene starts
        if cur.idx < len(self.scenes) - 1:
            st = t - cur.start - cur.overlap * 0.5
            if 0 <= st < 0.55:
                q = E.ease_out_cubic(st / 0.55)
                x = int(-self.shine.width + q * (self.W + self.shine.width * 1.2))
                al = int(46 * (1 - q))
                img.paste((255, 255, 255), (x, 0), self.shine.getchannel("A").point([min(255, int(i * al / 255)) for i in range(256)]))
        # hook scrim
        if t < self.hook_end + 0.4:
            a = 0.52 * (1 - E.clamp01((t - (self.hook_end - 0.2)) / 0.5))
            if a > 0.01:
                img = Image.blend(img, Image.new("RGB", img.size, (6, 10, 26)), a)
        for o in self.overlays:
            if o["t0"] <= t < o["t1"]:
                o["block"].draw(img, o["x"], o["y"], t - o["t0"], life=o["t1"] - o["t0"])
        self._release(t)
        return img

    # ------------------------------------------------------------------ introspection (QC + metadata)
    def layout_report(self):
        end = self._scene_obj(self.scenes[-1])
        ov = []
        for o in self.overlays:
            b = o["block"]
            ov.append({"role": o["role"], "text": o["text"].replace("**", ""), "font_px": b.font_px, "words": len(b.words),
                       "box": [round(v, 1) for v in b.box(o["x"], o["y"])], "t0": round(o["t0"], 3),
                       "t1": round(o["t1"], 3), "scene": o["scene"]})
        for box, role in end.boxes:
            ov.append({"role": role, "text": role, "font_px": 0 if role.endswith("button") else
                       (end.main.font_px if role.endswith("main") else end.sub.font_px),
                       "words": 0, "box": [round(v, 1) for v in box], "t0": round(self.end_start + 0.5, 3),
                       "t1": round(self.duration, 3), "scene": len(self.scenes) - 1})
        samples = []
        step = 0.25
        t = 0.0
        while t < self.end_start:
            prev, cur, p = self._active(t)
            rects = []
            if cur.idx < len(self.scenes) - 1:
                obj = self._scene_obj(cur)
                if hasattr(obj, "_window") or hasattr(obj, "_geom"):
                    rects = [[round(v, 1) for v in r] for r in obj.focus_rects(t - cur.start)]
            samples.append({"t": round(t, 2), "scene": cur.idx, "in_transition": p is not None, "focus": rects})
            t += step
        return {"safe": list(self.safe), "overlays": ov, "focus_samples": samples,
                "scenes": [{"idx": s.idx, "start": round(s.start, 3), "end": round(s.end, 3),
                            "source": s.source_id, "fallback": s.used_fallback,
                            "layout": s.spec.get("layout", "full" if s.idx < len(self.scenes) - 1 else "endcard")}
                           for s in self.scenes],
                "hook_end": round(self.hook_end, 3), "end_start": round(self.end_start, 3)}

    def close(self):
        for rs in self.scenes:
            if rs.obj is not None:
                rs.obj.close()
