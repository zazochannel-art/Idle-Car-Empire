"""Kinetic typography: word sprites with stroke + shadow, plates, pop/slam/rise/slide animations."""
import math
import re

from PIL import Image, ImageDraw, ImageFilter

from . import easing as E
from .fonts import font

WHITE = (255, 255, 255)
ACCENT = (255, 200, 40)      # brand yellow
INK = (10, 14, 30)           # brand navy ink
PLATE = (8, 12, 28, 190)

_MARKUP = re.compile(r"(\*\*)")


def parse_markup(text):
    """'What if you built your **car empire**?' -> [('What', False), ..., ('car', True), ('empire?', True)].
    Punctuation glued to a **bold** span (no space) stays part of the same word."""
    words, emph, glue = [], False, False
    for tok in _MARKUP.split(text):
        if tok == "**":
            emph = not emph
            glue = not emph   # only a closing ** can glue the next characters on
            continue
        parts = tok.split()
        if parts and glue and words and not tok[0].isspace():
            words[-1] = (words[-1][0] + parts[0], words[-1][1])
            parts = parts[1:]
        for w in parts:
            words.append((w, emph))
        glue = False
    return words


def _alpha_scaled(sprite, a):
    if a >= 0.999:
        return sprite.getchannel("A")
    lut = [int(i * a) for i in range(256)]
    return sprite.getchannel("A").point(lut)


class TextBlock:
    """A wrapped, centred block of words that can be drawn at any time t with an animation."""

    def __init__(self, markup, weight="black", size=110, max_w=900, max_lines=3, color=WHITE, accent=ACCENT,
                 stroke_rel=0.085, plate=None, plate_pad=(0.45, 0.22), style="pop", stagger=0.07,
                 anim_dur=0.30, line_gap=0.0, upper=False, shadow=True, align="center", min_size=54):
        self.markup = markup.upper() if upper else markup
        self.weight, self.color, self.accent = weight, color, accent
        self.style, self.stagger, self.anim_dur = style, stagger, anim_dur
        self.plate, self.align, self.shadow = plate, align, shadow
        self.words = parse_markup(self.markup)
        self.size = size
        self.stroke_rel, self.line_gap, self.plate_pad = stroke_rel, line_gap, plate_pad
        # shrink until it fits in max_lines
        while True:
            self._layout(max_w)
            if len(self.lines) <= max_lines or self.size <= min_size:
                break
            self.size = max(min_size, int(self.size * 0.93))
        self._sprites = {}

    # ---- layout -----------------------------------------------------------------------------
    def _layout(self, max_w):
        fnt = font(self.weight, self.size)
        self.sw = int(self.size * self.stroke_rel)
        if self.stroke_rel > 0:
            self.sw = max(3, self.sw)
        space = fnt.getlength(" ") + self.size * 0.02
        asc, desc = fnt.getmetrics()
        self.line_h = int((asc + desc) * (1 + self.line_gap))
        self.lines, cur, cur_w = [], [], 0
        for idx, (w, emph) in enumerate(self.words):
            ww = fnt.getlength(w)
            if cur and cur_w + space + ww > max_w:
                self.lines.append((cur, cur_w))
                cur, cur_w = [], 0
            cur_w += (space if cur else 0) + ww
            cur.append((idx, w, emph, ww))
        if cur:
            self.lines.append((cur, cur_w))
        self.text_w = int(max((w for _, w in self.lines), default=0))
        self.text_h = self.line_h * len(self.lines)
        self.space = space
        px, py = self.plate_pad
        self.pad_x = int(self.size * px) if self.plate else 0
        self.pad_y = int(self.size * py) if self.plate else 0
        self.w = self.text_w + 2 * self.pad_x
        self.h = self.text_h + 2 * self.pad_y
        # word positions relative to block top-left
        self.pos = {}
        y = self.pad_y
        for line, lw in self.lines:
            if self.align == "center":
                x = self.pad_x + (self.text_w - lw) / 2
            else:
                x = self.pad_x
            for idx, w, emph, ww in line:
                self.pos[idx] = (x, y)
                x += ww + space
            y += self.line_h

    @property
    def font_px(self):
        return self.size

    # ---- sprites ----------------------------------------------------------------------------
    def _word_sprite(self, idx):
        if idx in self._sprites:
            return self._sprites[idx]
        w, emph = self.words[idx]
        fnt = font(self.weight, self.size)
        pad = self.sw + 14
        stroke_fill = INK if self.sw else None
        adv = int(math.ceil(fnt.getlength(w)))
        sw_, sh_ = adv + 2 * pad, self.line_h + 2 * pad
        spr = Image.new("RGBA", (sw_, sh_), (0, 0, 0, 0))
        if self.shadow:
            sh = Image.new("RGBA", (sw_, sh_), (0, 0, 0, 0))
            ImageDraw.Draw(sh).text((pad, pad + int(self.size * 0.05)), w, font=fnt, fill=(0, 0, 0, 170),
                                    stroke_width=self.sw, stroke_fill=(0, 0, 0, 170))
            spr.alpha_composite(sh.filter(ImageFilter.GaussianBlur(self.size * 0.035)))
        ImageDraw.Draw(spr).text((pad, pad), w, font=fnt, fill=self.accent if emph else self.color,
                                 stroke_width=self.sw, stroke_fill=stroke_fill)
        self._sprites[idx] = (spr, pad)
        return self._sprites[idx]

    def _plate_sprite(self):
        if "plate" in self._sprites:
            return self._sprites["plate"]
        fill = self.plate if isinstance(self.plate, tuple) else PLATE
        spr = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(spr)
        r = int(self.size * 0.32)
        d.rounded_rectangle((0, 0, self.w - 1, self.h - 1), radius=r, fill=fill)
        self._sprites["plate"] = spr
        return spr

    # ---- drawing ----------------------------------------------------------------------------
    def box(self, ox, oy):
        return (ox, oy, ox + self.w, oy + self.h)

    def draw(self, img, ox, oy, t, life=None, exit_dur=0.22):
        """Draw onto RGB image `img` with block top-left at (ox, oy); t = seconds since the block started."""
        if t < 0:
            return
        ex = 1.0
        if life is not None and t > life - exit_dur:
            ex = 1 - E.clamp01((t - (life - exit_dur)) / exit_dur)
            if ex <= 0:
                return
        exit_dy = -(1 - ex) * 22
        dx_slide = 0
        if self.style == "slide":
            dx_slide = -(1 - E.ease_out_cubic(t / 0.35)) * 520
        if self.plate:
            pa = E.clamp01(t / 0.14) * ex
            pl = self._plate_sprite()
            if self.style == "slide":
                pa = ex
            if pa > 0:
                img.paste(pl, (int(ox + dx_slide), int(oy + exit_dy)), _alpha_scaled(pl, pa))
        for idx in range(len(self.words)):
            wx, wy = self.pos[idx]
            st = 0.0 if self.style == "slide" else idx * self.stagger
            if t < st:
                continue
            p = E.clamp01((t - st) / self.anim_dur)
            if self.style == "pop":
                sc = 0.55 + 0.45 * E.ease_out_back(p)
                a = min(1.0, p * 5)
                dy = (1 - E.ease_out_cubic(p)) * 26
            elif self.style == "slam":
                sc = 1 + 0.45 * (1 - E.ease_out_expo(p))
                a = min(1.0, p * 9)
                dy = 0
            elif self.style == "rise":
                sc, a, dy = 1.0, min(1.0, p * 3), (1 - E.ease_out_cubic(p)) * 60
            else:  # fade / slide
                sc, a, dy = 1.0, 1.0 if self.style == "slide" else p, 0
            a *= ex
            if a <= 0.01:
                continue
            spr, pad = self._word_sprite(idx)
            if abs(sc - 1) > 0.01:
                nw, nh = max(1, int(spr.width * sc)), max(1, int(spr.height * sc))
                cx = ox + wx - pad + spr.width / 2
                cy = oy + wy - pad + spr.height / 2
                spr = spr.resize((nw, nh), Image.BILINEAR)
                px, py = int(cx - nw / 2), int(cy - nh / 2)
            else:
                px, py = int(ox + wx - pad), int(oy + wy - pad)
            img.paste(spr, (int(px + dx_slide), int(py + dy + exit_dy)), _alpha_scaled(spr, a))

    def settle_time(self):
        """Seconds until every word has finished animating in."""
        return (len(self.words) - 1) * self.stagger + self.anim_dur
