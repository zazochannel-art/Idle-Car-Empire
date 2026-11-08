# Idle Car Empire – automated promo video pipeline

Builds vertical (1080×1920, 9:16, H.264, 30 fps) promo videos for **TikTok, YouTube Shorts and Instagram Reels** from
**real in-game captures**, with animated captions, kinetic typography, transitions, synthesised music + sound effects,
an end card with the real logo and a Google Play call to action – then checks every export automatically.

Stack: Python 3 · Pillow · numpy · FFmpeg (MoviePy and OpenCV are *not* needed).

```
marketing/video-creator/
├── assets/
│   ├── gameplay/        real screenshots (early game) + clips/ for your screen recordings (git-ignored)
│   ├── music/           optional licensed tracks (override the built-in synthesised music)
│   ├── sound-effects/   optional licensed SFX (override the synthesised ones)
│   ├── logos/           optional logo / official Google Play badge overrides
│   ├── fonts/           Barlow Condensed (same family as the game UI, SIL OFL)
│   └── templates/       video-template.json (spec skeleton for new videos)
├── config/
│   ├── brand.json       name, slogan, Play URL, allowed marketing claims
│   ├── platforms.json   encode settings + per-platform safe zones + CTA hint
│   ├── sources.json     registry of REAL footage (provenance, hash, key-area rectangles)
│   ├── recording-wishlist.json   the screen recordings the videos are designed around
│   └── videos/video-01..06.json  one spec per video (scenes, hooks, endings, captions, descriptions, hashtags)
├── scripts/
│   ├── render.py        MAIN ENTRY: render + QC + metadata
│   ├── preview.py       contact sheet of still frames (fast layout check)
│   ├── check_env.py     environment check + list of missing recordings
│   ├── register_source.py   register a real clip/screenshot
│   ├── new_video.py     scaffold a new video spec
│   └── vc/              library: scenes, camera, transitions, textfx, audio, encode, qc, metadata
└── output/
    ├── tiktok/  youtube-shorts/  instagram-reels/   ← .mp4 + .json (metadata) per video
    └── .cache/  (rendered audio)
```

## 1. Install

| Need | Windows | macOS | Linux |
|---|---|---|---|
| Python 3.9+ | python.org | `brew install python` | `sudo apt install python3 python3-pip` |
| FFmpeg + ffprobe (libx264, aac, FFmpeg ≥ 4.4) | `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| Python packages | `pip install -r requirements.txt` | same | same |

```bash
cd marketing/video-creator
python scripts/check_env.py      # tells you what is missing, and which recordings are still wanted
```

## 2. Render

```bash
python scripts/render.py all                      # all 6 videos × 3 platforms = 18 MP4 + 18 JSON
python scripts/render.py 06                       # the trailer, all platforms
python scripts/render.py 01 --platform tiktok     # one file
python scripts/render.py 01 02 --jobs 4           # parallel (≈ 1 CPU core per job)
python scripts/preview.py 01 --safe --out p.png   # still frames + safe-zone rectangle, in seconds
```

Roughly 1.5–3 minutes of CPU per 25 s video per platform. The exit code is **non-zero if an export or a QC check fails**, and the
console prints the failing check – a failed export is never reported as success.

Each export writes `output/<platform>/video-NN-slug.mp4` and a `.json` with: specs (ffprobe), the exact FFmpeg command,
the chosen hook/ending/captions, **all** 3 hooks + 2 alternative endings + 2 caption sets, TikTok / Shorts / Reels descriptions,
hashtags, a ready-to-paste `post_text`, the footage provenance and the QC results.

### Content variants

Every video has 3 hooks, 3 endings (main + 2 alternatives) and 2 caption sets (A/B). The default render uses hook 1 / ending 1 / captions A:

```bash
python scripts/render.py 01 --hook 2 --ending 3 --captions B   # → video-01-…_h2e3cB.mp4 (+ .json)
```

## 3. Real footage only (important)

* Every scene points at a source id in `config/sources.json`. Each entry records origin, description, SHA-256 and the key-gameplay
  rectangle that captions must stay off. QC fails the export if a scene uses anything not registered as real.
  *(This is a provenance check, not forensics: `--real` is your statement that a file is an unedited capture.)*
* Copy is limited to claims in `config/brand.json` (taken from the Play listing: 20 kinds of factories, 23 car models, 15 plant levels, offline production, racing, research…). Don't add features the game doesn't have.
* **Today the sources are real screenshots** (the Play-listing phone + 10″ screenshots and two early-game captures); they are animated with camera
  moves, so scenes are *stills in motion*, not screen recordings. The scene specs already name the clips they would rather use
  (`"source": "clip:factory-interior", "fallback": "ph-factory"`). **When you register a recording with that id the scene uses it automatically – no spec change.**

### Adding real screen recordings

`python scripts/check_env.py` lists the 12 wanted clips; `config/recording-wishlist.json` says what each should show. Record on a phone/emulator in portrait:

```bash
adb shell screenrecord --size 1080x1920 --bit-rate 16000000 --time-limit 30 /sdcard/c.mp4 && adb pull /sdcard/c.mp4 assets/gameplay/clips/factory-interior.mp4
python scripts/register_source.py assets/gameplay/clips/factory-interior.mp4 --id factory-interior --real --description "Inside the Car Assembly Plant"
python scripts/render.py all
```
Tips: Do-Not-Disturb on, clean save without personal names, record 2–3 s extra, slow camera. Clips are git-ignored (large).

## 4. Make more videos

```bash
python scripts/new_video.py 07 my-idea "My Idea" --category short   # copies assets/templates/video-template.json
# edit config/videos/video-07.json: hooks, scenes, captions, descriptions
python scripts/preview.py 07 --safe --out p.png
python scripts/render.py 07
```
Scene fields: `source`/`fallback`, `dur`, `layout` (`full` camera over the source, or `phone` = source inside a phone frame),
`camera` `{from,to}` = `[centre-x, centre-y, zoom]` in source coordinates, `transition` (`cut|flash|push_left|push_up|zoom_punch|wipe`),
`caption_pos` (`upper|mid|lower`), `chip` (yellow stat badge). `**word**` highlights a word. Durations: short 15–20 s, standard 20–30 s, trailer 30–45 s (validated).

Change the look in `scripts/vc/` (`textfx.py` typography, `transitions.py`, `scenes.py` end card, `timeline.py` placement), encoding in `config/platforms.json`.

## 5. FFmpeg

The pipeline renders frames in Python and pipes raw RGB into FFmpeg (see `scripts/vc/encode.py`; the exact command is stored in each metadata JSON):

```
ffmpeg -f rawvideo -pix_fmt rgb24 -s 1080x1920 -r 30 -i - -i audio.wav -map 0:v -map 1:a \
  -vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p \
  -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.2 -pix_fmt yuv420p -maxrate 14M -bufsize 28M -g 60 -bf 2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart out.mp4
```
Audio is mixed in numpy and normalised with FFmpeg two-pass `loudnorm` to −14 LUFS / −2 dBTP (platform-friendly).
Screen-recording clips are decoded with `ffmpeg -ss … -vf scale+crop+fps=30 -f rawvideo`.

## 6. Quality control (automatic after every render)

| Check | Rule |
|---|---|
| `source_is_real_gameplay` | every scene source is in `sources.json`, flagged real, has origin, file exists (hash drift = warning) |
| `video_format`, `aspect_ratio_9x16`, `audio_format` | ffprobe: H.264 High, 1080×1920, yuv420p, 30 fps, SAR 1:1, AAC 48 kHz stereo |
| `duration_in_range`, `duration_matches_plan`, `platform_limit` | category range, equals the plan, ≤ platform limit |
| `plays_back_cleanly`, `av_sync_length` | full decode with `-xerror`, frame count, audio/video length |
| `audio_loudness`, `audio_true_peak`, `no_dead_air` | ebur128: −14 ±1.5 LUFS, ≤ −1 dBTP, no silence > 0.8 s |
| `text_inside_platform_safe_zone` | every text box inside that platform's safe area (UI overlays) |
| `subtitle_font_size`, `subtitle_reading_speed` | ≥ 64 px captions, ≤ 4 words/s |
| `subtitle_contrast` | measured on real exported frames, ≥ 3:1 (large text) |
| `text_vs_gameplay_overlap` | captions/chips vs the registered key-gameplay rectangle (camera-aware): warn > 18 %, fail > 30 % |
| `no_black_borders` | no letterbox/pillarbox strips on sampled gameplay frames |

## 7. Audio licensing

Music and effects are **generated by code** (`scripts/vc/audio.py`) – no samples, nothing to license. Drop licensed files into
`assets/music/` or `assets/sound-effects/` to override. Voice-over is not used (text-first videos); add one by mixing it into the audio in `render.py` if you ever want it.

## 8. Known limits

* Screenshot-based scenes have motion only from the virtual camera; real recordings will look better (see §3).
* The two early-game captures are 390×844 – shown small inside a phone frame, not full screen.
* The built-in music is simple procedural EDM-style; listen to it and swap in a licensed track if you prefer.
* The end card draws a plain button; add the official Google Play badge (see `assets/logos/README.md`) for the standard look.
* TikTok/Reels/Shorts UI zones change; adjust `safe` in `config/platforms.json`.
