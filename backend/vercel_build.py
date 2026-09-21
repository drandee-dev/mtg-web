"""Vercel build step: fetch data + pre-build caches for fast cold starts.

Runs after `pip install` and before the function bundle is created, so
everything written to ./data ships inside the deployment:

1. Fresh Scryfall download — Vercel's build cache can persist ./data between
   builds, and download_data.py skips existing files, which would freeze card
   prices forever. On Vercel we delete the bulk file first so every deploy
   (including the weekly refresh-data cron) gets current prices.
2. download_data.py — oracle-cards stripped to the fields the app uses
   (~50MB) + the Comprehensive Rules text.
3. mtg.warm() — builds the pickle sidecars (bulk .idx.pkl + parsed rules) next
   to the data files. At cold start the loaders find fresh sidecars and skip
   the 3-8s JSON parse.
"""

import json
import os
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent
os.environ.setdefault("MTG_DATA_DIR", str(_BACKEND / "data"))

if os.environ.get("VERCEL"):
    data_dir = Path(os.environ["MTG_DATA_DIR"])
    bulk = data_dir / "default-cards.json"
    if bulk.exists():
        print(f"Removing cached bulk file for a fresh price download: {bulk}")
        bulk.unlink()
        sidecar = bulk.with_name(bulk.name + ".idx.pkl")
        if sidecar.exists():
            sidecar.unlink()
    # The Comprehensive Rules are handled by download_rules(), which discovers the
    # current release and only replaces the cached copy once a newer one is safely
    # downloaded — so we deliberately do NOT pre-delete it here. Deleting first
    # would break the build whenever discovery or the download fails.

import download_data  # noqa: E402

download_data.download_bulk()
download_data.download_rules()

# Record the download date in a marker file — Vercel's bundler resets file
# mtimes, so mtg.data_as_of() can't rely on stat() inside the deployment.
import datetime  # noqa: E402

marker = Path(os.environ["MTG_DATA_DIR"]) / "data-as-of.txt"
marker.write_text(datetime.date.today().isoformat(), encoding="utf-8")
print(f"Wrote data-as-of marker: {marker.read_text(encoding='utf-8')}")

print("Pre-building pickle caches (bulk index + parsed rules)...")
from app import config, mtg  # noqa: E402  (bootstraps mtg_utils on import)

mtg.warm()

# Commander browse directory (Job 2): pre-build against the bulk data we just
# fetched, so cold start never has to. commander_chips.json (the one-time Haiku
# classification) is a committed static file, not regenerated here — see
# mtg_utils/commander_directory.py's module docstring.
print("Building commander directory...")
from mtg_utils.commander_directory import (  # noqa: E402
    build_commander_directory,
    load_chips,
)

_chips = load_chips(Path(os.environ["MTG_DATA_DIR"]) / "commander_chips.json")
_directory = build_commander_directory(config.BULK_PATH, _chips)
_out_path = Path(os.environ["MTG_DATA_DIR"]) / "commanders.json"
_out_path.write_text(json.dumps(_directory), encoding="utf-8")
print(f"Wrote {len(_directory)} commanders to {_out_path} ({len(_chips)} with chips).")

print("Build complete: data + caches ready for the function bundle.")
