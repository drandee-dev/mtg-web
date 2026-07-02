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

import os
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent
os.environ.setdefault("MTG_DATA_DIR", str(_BACKEND / "data"))

if os.environ.get("VERCEL"):
    bulk = Path(os.environ["MTG_DATA_DIR"]) / "default-cards.json"
    if bulk.exists():
        print(f"Removing cached bulk file for a fresh price download: {bulk}")
        bulk.unlink()
        sidecar = bulk.with_name(bulk.name + ".idx.pkl")
        if sidecar.exists():
            sidecar.unlink()

import download_data  # noqa: E402

download_data.download_bulk()
download_data.download_rules()

print("Pre-building pickle caches (bulk index + parsed rules)...")
from app import mtg  # noqa: E402  (bootstraps mtg_utils on import)

mtg.warm()
print("Build complete: data + caches ready for the function bundle.")
