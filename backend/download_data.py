"""Download Scryfall bulk data + Comprehensive Rules for the web backend.

Run once during deployment (or as a Render build step) to populate the data directory.
Uses the existing mtg_utils download_bulk module if available, otherwise downloads directly.
"""
import json
import os
import sys
from pathlib import Path
from urllib.request import urlopen, Request

DATA_DIR = Path(os.environ.get("MTG_DATA_DIR", Path(__file__).parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

BULK_PATH = DATA_DIR / "default-cards.json"
RULES_GLOB = "comprehensive-rules*.txt"


def download_bulk():
    """Download Scryfall oracle-cards bulk data (~30MB)."""
    # Remove old oversized default-cards.json if present (from prior deploys)
    if BULK_PATH.exists():
        size_mb = BULK_PATH.stat().st_size / 1_000_000
        if size_mb > 100:
            print(f"Removing oversized bulk file ({size_mb:.0f} MB) — switching to oracle_cards.")
            BULK_PATH.unlink()
        else:
            print(f"Bulk data already exists ({size_mb:.0f} MB): {BULK_PATH}")
            return

    print("Fetching Scryfall bulk data catalog...")
    req = Request("https://api.scryfall.com/bulk-data", headers={
        "User-Agent": "MTGWorkshop/1.0",
        "Accept": "application/json",
    })
    with urlopen(req) as resp:
        catalog = json.loads(resp.read())

    # Use oracle_cards (~30MB) instead of default_cards (~550MB) to fit in
    # free-tier memory limits. One entry per unique card — we only need one
    # record per card name anyway (prices, oracle text, images all present).
    uri = None
    for preferred in ("oracle_cards", "default_cards"):
        for entry in catalog.get("data", []):
            if entry.get("type") == preferred:
                uri = entry["download_uri"]
                break
        if uri:
            break

    if not uri:
        print("ERROR: Could not find oracle_cards or default_cards in Scryfall bulk catalog.")
        sys.exit(1)

    print(f"Downloading {uri} ...")
    req = Request(uri, headers={"User-Agent": "MTGWorkshop/1.0", "Accept": "*/*"})
    with urlopen(req) as resp:
        data = resp.read()
    BULK_PATH.write_bytes(data)
    print(f"Saved {len(data) / 1_000_000:.0f} MB to {BULK_PATH}")


def download_rules():
    """Download the latest Comprehensive Rules text."""
    existing = sorted(DATA_DIR.glob(RULES_GLOB))
    if existing:
        print(f"Rules already exist: {existing[-1].name}")
        return

    print("Downloading Comprehensive Rules from Wizards...")
    # Scryfall mirrors the rules
    try:
        req = Request("https://api.scryfall.com/bulk-data", headers={"User-Agent": "MTGWorkshop/1.0"})
        with urlopen(req) as resp:
            catalog = json.loads(resp.read())
        # The rulings file has a permalink we can use to find the CR date
    except Exception:
        pass

    # Direct download from Wizards' known URL pattern
    urls = [
        "https://media.wizards.com/2026/downloads/MagicCompRules_20260417.txt",
        "https://media.wizards.com/2025/downloads/MagicCompRules_20250404.txt",
    ]
    for url in urls:
        try:
            req = Request(url, headers={"User-Agent": "MTGWorkshop/1.0"})
            with urlopen(req) as resp:
                text = resp.read()
            # Extract date from URL for filename
            date_part = url.split("_")[-1].replace(".txt", "")
            out = DATA_DIR / f"comprehensive-rules-{date_part}.txt"
            out.write_bytes(text)
            print(f"Saved rules to {out}")
            return
        except Exception as e:
            print(f"  Failed {url}: {e}")
            continue

    print("WARNING: Could not download Comprehensive Rules. Rules lookup will be unavailable.")


if __name__ == "__main__":
    download_bulk()
    download_rules()
    print("Data download complete.")
