"""Download Scryfall bulk data + Comprehensive Rules for the web backend.

Downloads oracle_cards and strips it to only the fields the app uses,
cutting memory from ~200MB to ~60MB when loaded — fits in 512MB free tier.
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

# Only keep fields the app actually uses — everything else is discarded
_KEEP_FIELDS = {
    "name", "oracle_text", "mana_cost", "cmc", "type_line", "keywords",
    "colors", "color_identity", "produced_mana", "power", "toughness",
    "rarity", "prices", "legalities", "image_uris", "card_faces",
    "oracle_id", "layout", "game_changer", "printed_name", "flavor_name",
}


def _strip_card(card):
    """Keep only the fields we use, strip image_uris to just normal + small."""
    out = {k: card[k] for k in _KEEP_FIELDS if k in card}
    # Only keep 2 image sizes instead of 6
    if "image_uris" in out and out["image_uris"]:
        out["image_uris"] = {
            k: out["image_uris"][k]
            for k in ("normal", "small")
            if k in out["image_uris"]
        }
    # For DFCs, strip card_faces images too
    if "card_faces" in out and out["card_faces"]:
        for face in out["card_faces"]:
            if "image_uris" in face and face["image_uris"]:
                face["image_uris"] = {
                    k: face["image_uris"][k]
                    for k in ("normal", "small")
                    if k in face["image_uris"]
                }
    return out


def download_bulk():
    """Download Scryfall oracle-cards and strip to essential fields."""
    if BULK_PATH.exists():
        size_mb = BULK_PATH.stat().st_size / 1_000_000
        if size_mb > 100:
            print(f"Removing oversized bulk file ({size_mb:.0f} MB).")
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

    uri = None
    for entry in catalog.get("data", []):
        if entry.get("type") == "oracle_cards":
            uri = entry["download_uri"]
            break
    if not uri:
        print("ERROR: Could not find oracle_cards in Scryfall bulk catalog.")
        sys.exit(1)

    print(f"Downloading {uri} ...")
    req = Request(uri, headers={"User-Agent": "MTGWorkshop/1.0", "Accept": "*/*"})
    with urlopen(req) as resp:
        raw = resp.read()

    print(f"Downloaded {len(raw) / 1_000_000:.0f} MB. Stripping to essential fields...")
    cards = json.loads(raw)
    del raw  # free the raw bytes immediately
    stripped = [_strip_card(c) for c in cards]
    del cards

    output = json.dumps(stripped, separators=(",", ":"))
    BULK_PATH.write_text(output)
    print(f"Saved {len(output) / 1_000_000:.0f} MB stripped data ({len(stripped)} cards) to {BULK_PATH}")


def download_rules():
    """Download the latest Comprehensive Rules text."""
    existing = sorted(DATA_DIR.glob(RULES_GLOB))
    if existing:
        print(f"Rules already exist: {existing[-1].name}")
        return

    print("Downloading Comprehensive Rules...")
    urls = [
        "https://media.wizards.com/2026/downloads/MagicCompRules_20260417.txt",
        "https://media.wizards.com/2025/downloads/MagicCompRules_20250404.txt",
    ]
    for url in urls:
        try:
            req = Request(url, headers={"User-Agent": "MTGWorkshop/1.0"})
            with urlopen(req) as resp:
                text = resp.read()
            date_part = url.split("_")[-1].replace(".txt", "")
            out = DATA_DIR / f"comprehensive-rules-{date_part}.txt"
            out.write_bytes(text)
            print(f"Saved rules to {out}")
            return
        except Exception as e:
            print(f"  Failed {url}: {e}")
            continue

    print("WARNING: Could not download Comprehensive Rules.")


if __name__ == "__main__":
    download_bulk()
    download_rules()
    print("Data download complete.")
