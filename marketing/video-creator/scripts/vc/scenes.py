"""Scene renderers: camera moves over real gameplay (images or clips), phone-frame layout, end card."""
import subprocess
from functools import lru_cache

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from . import easing as E
from .fonts import font
from .paths import ROOT, LOGOS, REPO
from .textfx import TextBlock, ACCENT, INK, WHITE

# --------------------------------------------------------------------------------------------------
# sources


def source_path(entry):
    return (ROOT / entry["path"]).resolve()


@lru_cache(maxsize=32)
def load_image(path):
    return Image.open(path).convert("RGB")


class ClipReader:
    """Sequentially decodes a registered gameplay clip with FFmpeg (cover-scaled to W x H, 30 fps).
    The FFmpeg process is only started on the first frame request."""

    def __init__(self, path, start, dur, W, H, fps):
        self.path, self.start, self.dur = path, start, dur
        self.W, self.H, self.fps = W, H, fps
        self.n = 0
        self.p = None
        self.last = None

    def _spawn(self):
        W, H = self.W, self.H
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{self.start:.3f}", "-t", f"{self.dur + 0.1:.3f}", "-i", str(self.path),
               "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={self.fps}",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def frame(self, local_t):
        if self.p is None:
            self._spawn()
        want = int(local_t * self.fps + 1e-6)
        while self.n <= want:
            buf = self.p.stdout.read(self.W * self.H * 3)
            if len(buf) < self.W * self.H * 3:
                if self.last is None:
                    raise RuntimeError("clip shorter than the scene (or undecodable): " + self.p.stderr.read().decode()[:300])
                break  # hold the last frame if the clip ends a few frames early
            self.last = Image.frombytes("RGB", (self.W, self.H), buf)
            self.n += 1
        return self.last

    def close(self):
        if self.p is not None:
            try:
                self.p.kill()
            except Exception:
                pass


# --------------------------------------------------------------------------------------------------
# helpers


def cam_window(src_w, src_h, cx, cy, z, out_ar):
    """Largest window with the output aspect inside the source, divided by zoom z, centred on (cx, cy) normalised."""
    if src_w / src_h > out_ar:
        bh = float(src_h)
        bw = bh * out_ar
    else:
        bw = float(src_w)
        bh = bw / out_ar
    w, h = bw / z, bh / z
    x0 = min(max(cx * src_w - w / 2, 0), src_w - w)
    y0 = min(max(cy * src_h - h / 2, 0), src_h - h)
    return x0, y0, x0 + w, y0 + h


def lerp_cam(cam_from, cam_to, p):
    return [E.lerp(a, b, p) for a, b in zip(cam_from, cam_to)]


@lru_cache(maxsize=8)
def brand_background(W, H, variant=0):
    """Deep-navy → brand-blue gradient with soft diagonal light bands; taller than the frame so it can scroll."""
    ext = 480
    yy = np.linspace(0, 1, H + ext)[:, None, None]
    top = np.array([10, 16, 42], float)
    bot = np.array([22, 70, 150], float) if variant == 0 else np.array([14, 48, 110], float)
    g = top * (1 - yy) + bot * yy
    g = np.repeat(g, W, axis=1)
    xx, yv = np.meshgrid(np.arange(W), np.arange(H + ext))
    d = (xx * 0.55 + yv * 0.84)
    band = np.zeros_like(d)
    for off, wd, amp in ((300, 90, 22), (820, 160, 14), (1500, 60, 26), (2100, 120, 16)):
        band += amp * np.exp(-((d - off) / wd) ** 2)
    g = np.clip(g + band[..., None], 0, 255)
    return Image.fromarray(g.astype(np.uint8), "RGB")


@lru_cache(maxsize=4)
def vignette(W, H, strength=0.42):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 1.414
    a = np.clip((r - 0.45) / 0.55, 0, 1) ** 1.8 * strength * 255
    return Image.fromarray(a.astype(np.uint8), "L")


@lru_cache(maxsize=2)
def shine_sprite(W, H):
    """Soft diagonal highlight band used as a quick 'sweep' accent at scene starts."""
    bw = 260
    spr = np.zeros((H, bw + H // 2, 4), np.uint8)
    xx, yy = np.meshgrid(np.arange(spr.shape[1]), np.arange(H))
    d = xx - yy * 0.5 - bw / 2 - 0
    a = np.exp(-(d / (bw / 3.2)) ** 2) * 255
    spr[..., :3] = 255
    spr[..., 3] = a.astype(np.uint8)
    return Image.fromarray(spr, "RGBA")


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def map_rect(focus, box):
    """Normalised focus (x0,y0,x1,y1) inside a box (x0,y0,x1,y1) in pixels."""
    bx0, by0, bx1, by1 = box
    w, h = bx1 - bx0, by1 - by0
    return (bx0 + focus[0] * w, by0 + focus[1] * h, bx0 + focus[2] * w, by0 + focus[3] * h)


# --------------------------------------------------------------------------------------------------
# scenes


class FullScene:
    """Source fills the frame; a virtual camera pans/zooms across it."""

    kind = "full"

    def __init__(self, spec, entry, W, H, fps, clip_ok=True):
        self.spec, self.entry, self.W, self.H, self.fps = spec, entry, W, H, fps
        self.dur = spec["dur"]
        self.out_ar = W / H
        cam = spec.get("camera", {"from": [0.5, 0.5, 1.0], "to": [0.5, 0.5, 1.06]})
        self.cam_from, self.cam_to = cam["from"], cam["to"]
        self.ease = E.ease_in_out_sine if cam.get("ease", "sine") == "sine" else E.linear
        self.reader = None
        if entry["type"] == "clip":
            self.reader = ClipReader(source_path(entry), spec.get("clip_start", 0.0), self.dur, W, H, fps)
            self.src_size = (W, H)
            self.img = None
        else:
            self.img = load_image(source_path(entry))
            self.src_size = self.img.size

    def _window(self, t):
        p = self.ease(E.clamp01(t / self.dur))
        cx, cy, z = lerp_cam(self.cam_from, self.cam_to, p)
        return cam_window(*self.src_size, cx, cy, z, self.out_ar)

    def render(self, t):
        img = self.img if self.reader is None else self.reader.frame(t)
        win = self._window(t)
        return img.transform((self.W, self.H), Image.EXTENT, win, Image.BICUBIC)

    def focus_rects(self, t):
        x0, y0, x1, y1 = self._window(t)
        sx, sy = self.W / (x1 - x0), self.H / (y1 - y0)
        out = []
        for f in self.entry.get("focus", []):
            sw, sh = self.src_size
            fx0, fy0, fx1, fy1 = f[0] * sw, f[1] * sh, f[2] * sw, f[3] * sh
            out.append(((fx0 - x0) * sx, (fy0 - y0) * sy, (fx1 - x0) * sx, (fy1 - y0) * sy))
        return out

    def close(self):
        if self.reader:
            self.reader.close()


class PhoneScene:
    """The (whole) screenshot/clip shown inside a phone frame on an animated brand background."""

    kind = "phone"

    def __init__(self, spec, entry, W, H, fps, clip_ok=True):
        self.spec, self.entry, self.W, self.H, self.fps = spec, entry, W, H, fps
        self.dur = spec["dur"]
        if entry["type"] == "clip":
            self.reader = ClipReader(source_path(entry), spec.get("clip_start", 0.0), self.dur, W, H, fps)
            sw, sh = W, H
            self.img = None
        else:
            self.reader = None
            self.img = load_image(source_path(entry))
            sw, sh = self.img.size
        self.ph = int(spec.get("phone_height", 1400))
        self.pw = int(self.ph * sw / sh)
        self.bz = 16
        self.bg = brand_background(W, H, spec.get("bg_variant", 0))
        self._frame_sprite = self._build_frame()
        self._shadow = self._build_shadow()

    def _build_frame(self):
        bz = self.bz
        size = (self.pw + 2 * bz, self.ph + 2 * bz)
        spr = Image.new("RGBA", size, (0, 0, 0, 0))
        d = ImageDraw.Draw(spr)
        d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=64, fill=(16, 18, 28, 255), outline=(88, 100, 130, 255), width=3)
        return spr

    def _build_shadow(self):
        size = (self.pw + 2 * self.bz + 160, self.ph + 2 * self.bz + 160)
        s = Image.new("RGBA", size, (0, 0, 0, 0))
        ImageDraw.Draw(s).rounded_rectangle((80, 100, size[0] - 80, size[1] - 60), radius=70, fill=(0, 0, 0, 190))
        return s.filter(ImageFilter.GaussianBlur(34))

    def _geom(self, t):
        pop = E.ease_out_back(t / 0.5) if t < 0.5 else 1.0
        scale = (0.88 + 0.12 * pop) * (1.0 + 0.045 * E.clamp01(t / self.dur))
        bob = np.sin(t * 2.2) * 7
        cx, cy = self.W / 2, self.H / 2 + bob + float(self.spec.get("phone_dy", 0))
        w = (self.pw + 2 * self.bz) * scale
        h = (self.ph + 2 * self.bz) * scale
        return scale, cx, cy, w, h

    def render(self, t):
        scale, cx, cy, w, h = self._geom(t)
        off = int((t * 55) % 480)
        canvas = self.bg.crop((0, off, self.W, off + self.H)).copy()
        sh = self._shadow
        sh_s = sh.resize((int(sh.width * scale), int(sh.height * scale)), Image.BILINEAR)
        canvas.paste(sh_s, (int(cx - sh_s.width / 2), int(cy - sh_s.height / 2)), sh_s.getchannel("A"))
        shot = self.img if self.reader is None else self.reader.frame(t)
        screen = shot.resize((self.pw, self.ph), Image.LANCZOS)
        phone = self._frame_sprite.copy()
        phone.paste(screen, (self.bz, self.bz), rounded_mask((self.pw, self.ph), 50))
        phone = phone.resize((int(w), int(h)), Image.BILINEAR)
        canvas.paste(phone, (int(cx - w / 2), int(cy - h / 2)), phone.getchannel("A"))
        return canvas

    def focus_rects(self, t):
        scale, cx, cy, w, h = self._geom(t)
        bz = self.bz * scale
        box = (cx - w / 2 + bz, cy - h / 2 + bz, cx + w / 2 - bz, cy + h / 2 - bz)
        return [map_rect(f, box) for f in self.entry.get("focus", [])]

    def close(self):
        if self.reader:
            self.reader.close()


class EndCard:
    """Logo + main CTA text + Play button; draws its own text (positions reported for QC)."""

    kind = "endcard"

    def __init__(self, spec, ending, platform, brand, W, H, fps):
        self.spec, self.W, self.H, self.fps = spec, W, H, fps
        self.dur = spec["dur"]
        self.focus = []
        sz = platform["safe"]
        self.safe = (sz["left"], sz["top"], W - sz["right"], H - sz["bottom"])
        self.bg = brand_background(W, H, 1)
        logo_file = LOGOS / "logo-cutout.png"
        if not logo_file.exists():
            logo_file = REPO / "assets" / "logo-cutout.webp"
        self.logo = Image.open(logo_file).convert("RGBA")
        cx = (self.safe[0] + self.safe[2]) / 2
        self.cx = cx
        avail_w = (self.safe[2] - self.safe[0]) - 40
        slogan = ending.get("slogan", False)
        self.main = TextBlock(ending["text"], weight="black", size=150 if not slogan else 128, max_w=avail_w,
                              max_lines=2, style="slam", stagger=0.14, anim_dur=0.26, line_gap=-0.04)
        sub = ending.get("sub") or platform.get("cta_hint", "")
        self.sub = TextBlock(sub, weight="extrabold", size=70, max_w=avail_w, max_lines=2, style="rise",
                             stagger=0.05, color=(235, 242, 255)) if sub else None
        self.button_text = ending.get("button", "PLAY FREE ON GOOGLE PLAY")
        self.btn_font = font("black", 72)
        self.badge = LOGOS / "google-play-badge.png"
        # vertical layout inside safe box
        top = self.safe[1] + 10
        self.btn_h = 150
        safe_h = self.safe[3] - self.safe[1] - 10
        used = self.main.h + 26 + (self.sub.h if self.sub else 0) + 34 + self.btn_h - 40
        self.logo_px = int(min(640, safe_h - used))
        self.logo_y = top
        y = top + self.logo_px - 40
        self.main_y = y
        y += self.main.h + 26
        self.sub_y = y
        y += (self.sub.h if self.sub else 0) + 34
        self.btn_y = y
        self.btn_w = min(int(avail_w), 900)
        self.boxes = [(self.main.box(cx - self.main.w / 2, self.main_y), "endcard-main")]
        if self.sub:
            self.boxes.append((self.sub.box(cx - self.sub.w / 2, self.sub_y), "endcard-sub"))
        self.boxes.append(((cx - self.btn_w / 2, self.btn_y, cx + self.btn_w / 2, self.btn_y + self.btn_h), "endcard-button"))

    def total_bottom(self):
        return self.btn_y + self.btn_h

    def render(self, t):
        W, H = self.W, self.H
        off = int((t * 70) % 480)
        img = self.bg.crop((0, off, W, off + H)).copy()
        # glow behind the logo
        glow = Image.new("RGBA", (900, 900), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((100, 100, 800, 800), fill=(255, 200, 40, 90))
        glow = glow.filter(ImageFilter.GaussianBlur(110))
        pulse = 1.0 + 0.04 * np.sin(t * 3.0)
        g = glow.resize((int(900 * pulse), int(900 * pulse)), Image.BILINEAR)
        lcy = self.logo_y + self.logo_px / 2
        img.paste(g, (int(self.cx - g.width / 2), int(lcy - g.height / 2)), g.getchannel("A"))
        # logo bounce-in
        p = E.ease_out_back(t / 0.55)
        s = max(0.01, 0.4 + 0.6 * p)
        lp = int(self.logo_px * s * (1 + 0.012 * np.sin(t * 2.4)))
        logo = self.logo.resize((lp, lp), Image.LANCZOS)
        a = E.clamp01(t / 0.2)
        img.paste(logo, (int(self.cx - lp / 2), int(lcy - lp / 2)), logo.getchannel("A").point([int(i * a) for i in range(256)]))
        # texts
        self.main.draw(img, self.cx - self.main.w / 2, self.main_y, t - 0.45)
        if self.sub:
            self.sub.draw(img, self.cx - self.sub.w / 2, self.sub_y, t - 0.45 - self.main.settle_time() * 0.6)
        # button
        bt = t - 0.45 - self.main.settle_time() * 0.6 - 0.2
        if bt > 0:
            pop = E.ease_out_back(bt / 0.4)
            sc = (0.7 + 0.3 * pop) * (1 + 0.015 * np.sin(t * 5))
            self._button(img, sc, E.clamp01(bt / 0.15))
        return img

    def _button(self, img, scale, alpha):
        bw, bh = self.btn_w, self.btn_h
        if self.badge.exists():
            badge = Image.open(self.badge).convert("RGBA")
            r = min(bw / badge.width, bh / badge.height)
            btn = badge.resize((int(badge.width * r), int(badge.height * r)), Image.LANCZOS)
        else:
            btn = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
            d = ImageDraw.Draw(btn)
            d.rounded_rectangle((0, 8, bw - 1, bh - 1), radius=bh // 2, fill=(150, 100, 0, 255))
            d.rounded_rectangle((0, 0, bw - 1, bh - 9), radius=bh // 2, fill=ACCENT + (255,))
            txt = self.button_text
            tw = self.btn_font.getlength(txt)
            tri = 46
            total = tri + 28 + tw
            x = (bw - total) / 2
            cy = (bh - 8) / 2
            d.polygon([(x, cy - tri / 2), (x, cy + tri / 2), (x + tri * 0.9, cy)], fill=INK)
            d.text((x + tri + 28, cy), txt, font=self.btn_font, fill=INK, anchor="lm")
        if abs(scale - 1) > 0.005:
            btn = btn.resize((int(btn.width * scale), int(btn.height * scale)), Image.BILINEAR)
        bx = int(self.cx - btn.width / 2)
        by = int(self.btn_y + self.btn_h / 2 - btn.height / 2)
        sh = Image.new("RGBA", (btn.width + 80, btn.height + 80), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((40, 52, btn.width + 40, btn.height + 52), radius=btn.height // 2, fill=(0, 0, 0, 110))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        img.paste(sh, (bx - 40, by - 40), sh.getchannel("A"))
        al = btn.getchannel("A").point([int(i * alpha) for i in range(256)])
        img.paste(btn, (bx, by), al)

    def focus_rects(self, t):
        return []

    def close(self):
        pass
