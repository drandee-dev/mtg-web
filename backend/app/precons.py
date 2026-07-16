"""MTGJSON preconstructed-deck lookup (Commander precons, intro packs, etc.).

DeckList.json (~3000 decks) is fetched lazily and cached in module state for
the life of the instance (serverless: warm invocations reuse it; cold starts
refetch). Individual deck files are fetched on demand and cached the same way.
MTGJSON lags brand-new releases by days to weeks, so callers must degrade
gracefully — a missing deck means "ask the user to paste the list", never an
error surfaced to chat.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Any

_INDEX_URL = "https://mtgjson.com/api/v5/DeckList.json"
_DECK_URL = "https://mtgjson.com/api/v5/decks/{file}.json"
_HEADERS = {"User-Agent": "MTGWorkshop/1.0"}
_INDEX_TTL = 24 * 3600
# Skip ultra-short deck names for in-chat detection — "Blitz", "Chaos" etc.
# appear in normal deck talk far too often to treat as product references.
_MIN_MATCH_LEN = 6

_lock = threading.Lock()
_index_cache: tuple[float, list[dict]] | None = None
_deck_cache: dict[str, dict] = {}


def _index() -> list[dict[str, Any]]:
    global _index_cache
    with _lock:
        if _index_cache and time.time() - _index_cache[0] < _INDEX_TTL:
            return _index_cache[1]
    import requests

    resp = requests.get(_INDEX_URL, headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    decks = resp.json().get("data") or []
    with _lock:
        _index_cache = (time.time(), decks)
    return decks


def search_precons(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Fuzzy name search over the index: exact > prefix > substring, newest first."""
    q = " ".join(query.lower().split())
    if not q:
        return []
    scored: list[tuple[int, str, dict]] = []
    for d in _index():
        n = " ".join((d.get("name") or "").lower().split())
        if not n:
            continue
        if q == n:
            score = 3
        elif n.startswith(q):
            score = 2
        elif q in n:
            score = 1
        else:
            continue
        scored.append((score, d.get("releaseDate") or "", d))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [t[2] for t in scored[:limit]]


def match_precon(text: str) -> dict[str, Any] | None:
    """Detect a precon referenced by name inside free chat text.

    Word-boundary containment; the longest matching name wins (so "Blight
    Curse" beats a hypothetical "Blight"), newest printing breaks ties.
    """
    t = " ".join(text.lower().split())
    if len(t) < _MIN_MATCH_LEN:
        return None
    best: tuple[tuple[int, str], dict] | None = None
    for d in _index():
        name = d.get("name") or ""
        if len(name) < _MIN_MATCH_LEN:
            continue
        if re.search(rf"\b{re.escape(name.lower())}\b", t):
            key = (len(name), d.get("releaseDate") or "")
            if best is None or key > best[0]:
                best = (key, d)
    return best[1] if best else None


def fetch_precon(file_name: str) -> dict[str, Any]:
    """Fetch one deck file → {name, code, release, type, commanders, decklist, sideboard}."""
    if file_name in _deck_cache:
        return _deck_cache[file_name]
    import requests

    resp = requests.get(_DECK_URL.format(file=file_name), headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    data = resp.json().get("data") or {}

    def _lines(board: str) -> list[str]:
        out = []
        for c in data.get(board) or []:
            name = c.get("name")
            if name:
                out.append(f"{c.get('count', 1)} {name}")
        return out

    deck = {
        "name": data.get("name", ""),
        "code": data.get("code", ""),
        "release": data.get("releaseDate", ""),
        "type": data.get("type", ""),
        "commanders": [
            c.get("name") for c in (data.get("commander") or []) if c.get("name")
        ],
        "decklist": _lines("mainBoard"),
        "sideboard": _lines("sideBoard"),
    }
    with _lock:
        if len(_deck_cache) > 40:
            _deck_cache.clear()
        _deck_cache[file_name] = deck
    return deck
