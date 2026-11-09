Put raw screen recordings here (`<clip id>.mp4`), then register them:

    python scripts/register_source.py assets/gameplay/clips/factory-interior.mp4 --id factory-interior --real \
        --description "Inside the Car Assembly Plant"

Clip ids wanted: see `config/recording-wishlist.json` (or run `python scripts/check_env.py`).
Clips are git-ignored on purpose.
