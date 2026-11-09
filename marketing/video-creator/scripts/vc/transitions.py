"""Scene-to-scene transitions. apply(name, A, B, p) -> PIL RGB image. p runs 0 → 1."""
import numpy as np
from PIL import Image, ImageChops, ImageDraw

from . import easing as E

ACCENT = (255, 200, 40)


def _white(size):
    return Image.new("RGB", size, (255, 255, 255))


def flash(A, B, p):
    if p < 0.5:
        return Image.blend(A, _white(A.size), E.ease_out_cubic(p * 2) * 0.92)
    return Image.blend(B, _white(A.size), (1 - E.ease_in_out_sine((p - 0.5) * 2)) * 0.92)


def _dir_blur(img, axis, amount, taps=9):
    if amount < 2:
        return img
    arr = np.asarray(img)
    acc = np.zeros(arr.shape, np.uint16)
    shifts = np.linspace(-amount, amount, taps).astype(int)
    for s in shifts:
        acc += np.roll(arr, int(s), axis=axis)
    return Image.fromarray((acc // taps).astype(np.uint8), "RGB")


def push(A, B, p, axis):
    W, H = A.size
    q = E.ease_in_out_cubic(p)
    canvas = Image.new("RGB", (W, H))
    if axis == 1:   # horizontal, content moves left
        dx = int(q * W)
        canvas.paste(A, (-dx, 0))
        canvas.paste(B, (W - dx, 0))
    else:           # vertical, content moves up
        dy = int(q * H)
        canvas.paste(A, (0, -dy))
        canvas.paste(B, (0, H - dy))
    amount = float(np.sin(np.pi * p)) * (90 if axis == 1 else 120)
    return _dir_blur(canvas, axis, amount)


def zoom_punch(A, B, p):
    W, H = A.size
    q = E.ease_in_out_cubic(p)

    def zoomed(img, s):
        w, h = W / s, H / s
        box = ((W - w) / 2, (H - h) / 2, (W + w) / 2, (H + h) / 2)
        return img.transform((W, H), Image.EXTENT, box, Image.BILINEAR)

    a = zoomed(A, 1 + 0.55 * q)
    b = zoomed(B, 1.55 - 0.55 * q)
    out = Image.blend(a, b, E.ease_in_out_sine(p))
    bump = float(np.sin(np.pi * p)) * 0.25
    return Image.blend(out, _white((W, H)), bump)


def wipe(A, B, p):
    """Diagonal wipe revealing B behind a brand-yellow edge."""
    W, H = A.size
    q = E.ease_in_out_cubic(p)
    slant = 380
    x = int(-slant + q * (W + slant * 2))
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    d.polygon([(0, 0), (x, 0), (x - slant, H), (0, H)], fill=255)
    out = A.copy()
    out.paste(B, (0, 0), mask)
    bar = Image.new("RGB", (W, H), ACCENT)
    bm = Image.new("L", (W, H), 0)
    ImageDraw.Draw(bm).polygon([(x, 0), (x + 46, 0), (x + 46 - slant, H), (x - slant, H)], fill=255)
    out.paste(bar, (0, 0), bm)
    return out


def apply(name, A, B, p):
    if name == "flash":
        return flash(A, B, p)
    if name == "push_left":
        return push(A, B, p, 1)
    if name == "push_up":
        return push(A, B, p, 0)
    if name == "zoom_punch":
        return zoom_punch(A, B, p)
    if name == "wipe":
        return wipe(A, B, p)
    return B if p >= 0.5 else A


NAMES = ("cut", "flash", "push_left", "push_up", "zoom_punch", "wipe")
