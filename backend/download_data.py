"""Download Scryfall bulk data + Comprehensive Rules for the web backend.

Downloads oracle_cards and strips it to only the fields the app uses,
cutting memory from ~200MB to ~60MB when loaded — fits in 512MB free tier.
"""

import json
import os
import re
import sys
from pathlib import Path
from urllib.request import urlopen, Request

DATA_DIR = Path(os.environ.get("MTG_DATA_DIR", Path(__file__).parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

BULK_PATH = DATA_DIR / "default-cards.json"
RULES_GLOB = "comprehensive-rules*.txt"

# Only keep fields the app actually uses — everything else is discarded
_KEEP_FIELDS = {
    "name",
    "oracle_text",
    "mana_cost",
    "cmc",
    "type_line",
    "keywords",
    "colors",
    "color_identity",
    "produced_mana",
    "power",
    "toughness",
    "rarity",
    "prices",
    "legalities",
    "image_uris",
    "card_faces",
    "oracle_id",
    "layout",
    "game_changer",
    "printed_name",
    "flavor_name",
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
    req = Request(
        "https://api.scryfall.com/bulk-data",
        headers={
            "User-Agent": "MTGWorkshop/1.0",
            "Accept": "application/json",
        },
    )
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
    print(
        f"Saved {len(output) / 1_000_000:.0f} MB stripped data ({len(stripped)} cards) to {BULK_PATH}"
    )


# WotC hosts each Comprehensive Rules release as a dated .txt on media.wizards.com
# and links the current one from the public rules page. Discovering it there means
# a new CR (shipped with roughly every set) is picked up automatically instead of
# needing a code edit. The dated fallbacks below are only used if discovery fails.
_RULES_PAGE = "https://magic.wizards.com/en/rules"
_RULES_TXT_RE = re.compile(
    r"https://media\.wizards\.com/\d+/downloads/[^\s\"']*?MagicCompRules[^\s\"']*?\.txt",
    re.IGNORECASE,
)
_RULES_FALLBACK_URLS = [
    "https://media.wizards.com/2026/downloads/MagicCompRules_20260417.txt",
    "https://media.wizards.com/2025/downloads/MagicCompRules_20250404.txt",
]


def _rules_date_key(url):
    """Sort key: the 8-digit date embedded in a MagicCompRules_YYYYMMDD.txt URL."""
    m = re.search(r"(\d{8})", url)
    return m.group(1) if m else ""


def discover_latest_rules_url():
    """Scrape the WotC rules page for the newest MagicCompRules_*.txt link.

    Returns the URL with the latest embedded date, or None if the page can't be
    fetched or contains no such link (caller falls back to the pinned URLs).
    """
    try:
        req = Request(_RULES_PAGE, headers={"User-Agent": "MTGWorkshop/1.0"})
        with urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"  Rules-page discovery failed ({e}); using pinned fallbacks.")
        return None
    urls = _RULES_TXT_RE.findall(html)
    if not urls:
        print("  No CR .txt link found on rules page; using pinned fallbacks.")
        return None
    latest = max(urls, key=_rules_date_key)
    print(f"  Discovered latest CR: {latest}")
    return latest


def download_rules():
    """Download the latest Comprehensive Rules text."""
    existing = sorted(DATA_DIR.glob(RULES_GLOB))
    if existing:
        print(f"Rules already exist: {existing[-1].name}")
        return

    print("Downloading Comprehensive Rules...")
    discovered = discover_latest_rules_url()
    urls = ([discovered] if discovered else []) + _RULES_FALLBACK_URLS
    for url in urls:
        try:
            req = Request(url, headers={"User-Agent": "MTGWorkshop/1.0"})
            with urlopen(req) as resp:
                text = resp.read()
            # Prefer the embedded YYYYMMDD; fall back to the pre-.txt token so the
            # newest file still sorts last in resolve_rules_path's glob.
            date_part = _rules_date_key(url) or url.split("_")[-1].replace(".txt", "")
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
