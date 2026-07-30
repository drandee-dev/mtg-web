"""Download Scryfall bulk data + Comprehensive Rules for the web backend.

Downloads oracle_cards and strips it to only the fields the app uses,
cutting memory from ~200MB to ~60MB when loaded — fits in 512MB free tier.
"""

import gzip
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

    # Scryfall dropped the plain-JSON `download_uri` in favour of a gzipped JSONL
    # file exposed as `jsonl_download_uri`. Prefer the old field if it ever returns,
    # otherwise fall back to the JSONL download (content-sniffed + decompressed below).
    uri = None
    for entry in catalog.get("data", []):
        if entry.get("type") == "oracle_cards":
            uri = entry.get("download_uri") or entry.get("jsonl_download_uri")
            break
    if not uri:
        print("ERROR: Could not find an oracle_cards download URI in Scryfall bulk catalog.")
        sys.exit(1)

    print(f"Downloading {uri} ...")
    req = Request(uri, headers={"User-Agent": "MTGWorkshop/1.0", "Accept": "*/*"})
    with urlopen(req) as resp:
        raw = resp.read()

    # Gunzip if it's a .gz payload (gzip magic bytes 1f 8b); urllib does not
    # auto-decompress a gzipped file body.
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)

    print(f"Downloaded {len(raw) / 1_000_000:.0f} MB. Stripping to essential fields...")
    # Two possible shapes: a single JSON array (old `download_uri`) or JSONL —
    # one card object per line (new `jsonl_download_uri`). Sniff the first byte.
    body = raw.lstrip()
    if body[:1] == b"[":
        cards = json.loads(body)
    else:
        cards = [json.loads(line) for line in body.splitlines() if line.strip()]
    del raw, body  # free the raw bytes immediately
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
# needing a code edit. Note the live filename uses a SPACE before the date
# ("MagicCompRules 20260619.txt"), which must be %20-encoded to fetch. WotC keeps
# only the current release, so there are no reliable dated fallbacks — discovery
# is the source of truth, and an already-downloaded copy is the safety net.
_RULES_PAGE = "https://magic.wizards.com/en/rules"
# Match both the space and underscore filename conventions WotC has used.
_RULES_TXT_RE = re.compile(
    r"https://media\.wizards\.com/\d+/downloads/MagicCompRules[ _]?\d{8}\.txt",
    re.IGNORECASE,
)


def _rules_date_key(url):
    """Sort key: the 8-digit date embedded in a MagicCompRules_YYYYMMDD.txt URL."""
    m = re.search(r"(\d{8})", url or "")
    return m.group(1) if m else ""


def discover_latest_rules_url():
    """Scrape the WotC rules page for the newest MagicCompRules .txt link.

    Returns the URL with the latest embedded date, or None if the page can't be
    fetched or contains no such link. A browser-like User-Agent is required —
    the default urllib agent gets a bot-blocked response with no link in it.
    """
    try:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        req = Request(_RULES_PAGE, headers={"User-Agent": ua})
        with urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"  Rules-page discovery failed ({e}).")
        return None
    urls = _RULES_TXT_RE.findall(html)
    if not urls:
        print("  No CR .txt link found on rules page.")
        return None
    latest = max(urls, key=_rules_date_key)
    print(f"  Discovered latest CR: {latest}")
    return latest


def download_rules():
    """Download the current Comprehensive Rules, if newer than what we have.

    Never deletes the existing copy until a newer one is safely written, so a
    failed download (or a WotC outage) leaves the last-good CR in place rather
    than breaking the build. Older copies are pruned only after a successful save.
    """
    existing = sorted(DATA_DIR.glob(RULES_GLOB), key=lambda p: _rules_date_key(p.name))
    existing_date = _rules_date_key(existing[-1].name) if existing else ""

    url = discover_latest_rules_url()
    if not url:
        if existing:
            print(f"Discovery failed; keeping cached rules: {existing[-1].name}")
        else:
            print("WARNING: Could not discover Comprehensive Rules and none cached.")
        return

    new_date = _rules_date_key(url)
    if existing and existing_date >= new_date:
        print(f"Rules already current ({existing[-1].name}); skipping download.")
        return

    print(f"Downloading Comprehensive Rules ({new_date})...")
    try:
        # The live filename contains a literal space that must be percent-encoded.
        req = Request(
            url.replace(" ", "%20"), headers={"User-Agent": "MTGWorkshop/1.0"}
        )
        with urlopen(req, timeout=60) as resp:
            text = resp.read()
    except Exception as e:
        keep = f"; keeping cached {existing[-1].name}" if existing else ""
        print(f"WARNING: CR download failed ({e}){keep}.")
        return

    out = DATA_DIR / f"comprehensive-rules-{new_date}.txt"
    out.write_bytes(text)
    print(f"Saved rules to {out}")

    # Prune superseded CR files + their parsed sidecars now that the new one is safe.
    for old in existing:
        if old != out:
            old.unlink(missing_ok=True)
            (old.parent / f"{old.name}.parsed.pkl").unlink(missing_ok=True)


if __name__ == "__main__":
    download_bulk()
    download_rules()
    print("Data download complete.")
