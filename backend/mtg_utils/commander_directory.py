"""Build the commander browse directory: every commander-eligible card,
ordered by EDHREC rank, optionally enriched with the one-time Haiku
strategy-chip classification.

Shared by two callers:
  - ``backend/vercel_build.py`` writes the result to ``backend/data/commanders.json``
    at deploy time (fresh bulk data, so prices/ranks never go stale between
    Scryfall re-downloads).
  - ``app/mtg.py::commander_directory()`` falls back to calling this in-process
    when that static file is missing or stale — mirrors the ``_bulk_index()``
    cache-by-mtime pattern, so local dev works without anyone running the
    build script by hand.

``commander_chips.json`` (the Haiku classification: playstyle/difficulty/
wins_via/themes per commander) is a *separate*, one-time paid batch job
(``backend/scripts/build_commander_chips.py``) — it is not regenerated on
every build. When it's absent, commanders simply carry no chips.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from mtg_utils.card_classify import extract_price, get_oracle_text
from mtg_utils.card_search import search_cards

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """URL-safe slug for a card name (``?slug=`` param, not a path route)."""
    return _SLUG_RE.sub("-", name.lower()).strip("-")


def load_chips(chips_path: Path) -> dict[str, dict[str, Any]]:
    """Load the one-time Haiku chip classification, keyed by commander name.
    Returns {} if the file doesn't exist or fails to parse — chips are an
    enrichment, never a hard dependency of the directory."""
    if not chips_path.exists():
        return {}
    try:
        data = json.loads(chips_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _assemble(
    cards: list[dict[str, Any]], chips: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Pure transform (no I/O): bulk records -> directory entries, sorted by
    EDHREC rank. Split out from build_commander_directory so it's testable
    without a real bulk-data file (see demo() below)."""
    out = []
    for c in cards:
        name = c.get("name", "")
        entry: dict[str, Any] = {
            "name": name,
            "slug": slugify(name),
            "color_identity": c.get("color_identity", []),
            "mana_cost": c.get("mana_cost", ""),
            "cmc": c.get("cmc", 0),
            "type_line": c.get("type_line", ""),
            "oracle_text": get_oracle_text(c),
            "edhrec_rank": c.get("edhrec_rank"),
            "price_usd": extract_price(c),
        }
        entry.update(chips.get(name, {}))
        out.append(entry)

    out.sort(key=lambda e: e["edhrec_rank"] if e["edhrec_rank"] is not None else 10**9)
    return out


def build_commander_directory(
    bulk_path: Path, chips: dict[str, dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Every commander-eligible card (cheapest printing), sorted by EDHREC
    rank ascending (unranked cards sort last)."""
    # is_commander_filter reuses the existing eligibility rule (card_classify.is_commander)
    # via search_cards; limit is set above the ~3.3k pool size so nothing is dropped.
    cards = search_cards(
        bulk_path,
        is_commander_filter=True,
        format="commander",
        sort="name-asc",
        limit=20000,
    )
    return _assemble(cards, chips or {})


def demo() -> None:
    """Runnable self-check for the pure merge/sort/slug logic (no bulk data
    file needed) — run with `python -m mtg_utils.commander_directory`."""
    fake_cards = [
        {
            "name": "Atraxa, Praetors' Voice",
            "color_identity": ["W", "U", "B", "G"],
            "mana_cost": "{G}{W}{U}{B}",
            "cmc": 4,
            "type_line": "Legendary Creature",
            "oracle_text": "Flying, vigilance...",
            "edhrec_rank": 12,
            "prices": {"usd": "12.00"},
        },
        {
            "name": "Unranked Cmdr",
            "color_identity": ["R"],
            "mana_cost": "{R}",
            "cmc": 1,
            "type_line": "Legendary Creature",
            "oracle_text": "",
            "edhrec_rank": None,
        },
        {
            "name": "Second Place",
            "color_identity": [],
            "mana_cost": "{1}",
            "cmc": 1,
            "type_line": "Legendary Creature",
            "oracle_text": "",
            "edhrec_rank": 50,
        },
    ]
    chips = {
        "Atraxa, Praetors' Voice": {
            "playstyle": "Superfriends",
            "difficulty": "Moderate",
            "wins_via": ["Combat damage"],
            "themes": ["Counters", "Proliferate"],
        }
    }

    out = _assemble(fake_cards, chips)
    assert [e["name"] for e in out] == [
        "Atraxa, Praetors' Voice",
        "Second Place",
        "Unranked Cmdr",
    ], f"unranked should sort last: {[e['name'] for e in out]}"
    assert out[0]["slug"] == "atraxa-praetors-voice", out[0]["slug"]
    assert out[0]["playstyle"] == "Superfriends", (
        "chips should merge onto the matching entry"
    )
    assert "playstyle" not in out[1], "a commander with no chip data should carry none"
    print("commander_directory.demo: OK")


if __name__ == "__main__":
    demo()
