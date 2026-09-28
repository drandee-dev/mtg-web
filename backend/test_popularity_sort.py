"""Self-check for the popularity sort behind composition fills.
Run: python test_popularity_sort.py

Hermetic: a tiny temp bulk file, the real search_cards sort path, no network.

Prod failure (audit #10): ai_composition_fills asked search_cards for
sort="edhrec-desc", _parse_sort didn't know "edhrec" and fell through to price,
so every fills category picked from the 20 most expensive matching cards. The
prod bulk also stripped edhrec_rank, so there was nothing to sort by anyway.
"""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import download_data  # noqa: E402
from mtg_utils.card_search import search_cards  # noqa: E402


def card(name, usd, rank=None):
    c = {
        "name": name,
        "oracle_text": "Draw a card.",
        "type_line": "Instant",
        "cmc": 2,
        "color_identity": ["U"],
        "legalities": {"commander": "legal"},
        "prices": {"usd": usd},
        "layout": "normal",
    }
    if rank is not None:
        c["edhrec_rank"] = rank
    return c


CARDS = [
    card("Pricey Unranked", "100.00"),  # A: price sort would put this first
    card("Cheap Staple", "0.50", rank=5),  # B: most played
    card("Mid Ranked", "5.00", rank=50),  # C: ranked, pricier than B
    {**card("Off Filter", "900.00", rank=1), "oracle_text": "Gain 3 life."},
]

# --- the bulk download keeps the field the sort needs ---------------------- #
assert "edhrec_rank" in download_data._KEEP_FIELDS
assert download_data._strip_card({"name": "x", "edhrec_rank": 5})["edhrec_rank"] == 5

with tempfile.TemporaryDirectory() as tmp:
    bulk = Path(tmp) / "default-cards.json"
    bulk.write_text(json.dumps(CARDS), encoding="utf-8")

    def names(sort):
        found = search_cards(
            bulk, oracle="draw a card", format="commander", sort=sort, limit=20
        )
        return [c["name"] for c in found]

    # The fills call's spelling, and the bare field: most played first,
    # unranked last, the off-filter card never in.
    for sort in ("edhrec-desc", "edhrec"):
        got = names(sort)
        assert got == ["Cheap Staple", "Mid Ranked", "Pricey Unranked"], (sort, got)

    # Least played first still keeps unranked cards last.
    got = names("edhrec-asc")
    assert got == ["Mid Ranked", "Cheap Staple", "Pricey Unranked"], got

    # Price sort is untouched.
    got = names("price-desc")
    assert got == ["Pricey Unranked", "Mid Ranked", "Cheap Staple"], got

print("test_popularity_sort: ok")
