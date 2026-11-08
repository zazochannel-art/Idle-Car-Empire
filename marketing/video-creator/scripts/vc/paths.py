"""Project paths. Everything is resolved relative to marketing/video-creator/."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # marketing/video-creator
REPO = ROOT.parents[1]                              # repository root
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"
MUSIC = ASSETS / "music"
SFX = ASSETS / "sound-effects"
LOGOS = ASSETS / "logos"
GAMEPLAY = ASSETS / "gameplay"
CONFIG = ROOT / "config"
VIDEOS = CONFIG / "videos"
OUTPUT = ROOT / "output"
CACHE = OUTPUT / ".cache"

PLATFORM_DIRS = {"tiktok": "tiktok", "youtube-shorts": "youtube-shorts", "instagram-reels": "instagram-reels"}
