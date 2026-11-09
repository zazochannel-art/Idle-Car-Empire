from functools import lru_cache
from PIL import ImageFont
from .paths import FONTS

_FILES = {"black": "BarlowCondensed-Black.ttf", "extrabold": "BarlowCondensed-ExtraBold.ttf", "bold": "BarlowCondensed-Bold.ttf"}


@lru_cache(maxsize=64)
def font(weight, size):
    path = FONTS / _FILES[weight]
    if not path.exists():
        raise SystemExit(f"Font missing: {path}. See assets/fonts/README.md")
    return ImageFont.truetype(str(path), int(size))
