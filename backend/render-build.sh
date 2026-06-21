#!/usr/bin/env bash
# Render build script: install Python deps + download Scryfall data if not present.
set -e

pip install -r requirements.txt

# Download bulk data + rules to ./data/ (persists across deploys on Render's disk)
export MTG_DATA_DIR="${MTG_DATA_DIR:-./data}"
python download_data.py

echo "Build complete. Data in $MTG_DATA_DIR"
