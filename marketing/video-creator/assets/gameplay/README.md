# Gameplay footage

Only **real** captures of Idle Car Empire may be used. Everything here must be registered in `config/sources.json`
(`scripts/register_source.py`), otherwise the QC check `source_is_real_gameplay` fails.

* `screenshots/` – real in-game screenshots that exist only outside the Play listing (early game: `early-game-1.png`, `early-game-2.png`).
  The Play-listing screenshots are used straight from `fastlane/metadata/android/en-US/images/` (not duplicated here).
* `clips/` – **drop your screen recordings here** (git-ignored: they are large). See `config/recording-wishlist.json`
  for the 12 clips the videos are designed around, and the README for how to record them.
