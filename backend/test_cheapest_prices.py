"""Self-check: production cards are priced at their cheapest playable printing.
Run: python test_cheapest_prices.py

Audit 2026-10-12 (G4 follow-up). Production bundles Scryfall oracle-cards, one
printing per card, and that printing had no USD price for 3.5% of
commander-legal cards (Chaos Warp, Swiftfoot Boots, basic lands) and a dearer
one for many more. A price cap dropped the unpriced ones. download_data.py now
streams default-cards (every printing) and keeps the lowest playable price.

No network: the reducer runs on an in-memory file.
"""

import json
import sys

sys.path.insert(0, ".")
import download_data as dd  # noqa: E402


def printing(oid, usd=None, foil=None, **extra):
    card = {
        "oracle_id": oid,
        "set_type": "expansion",
        "games": ["paper"],
        "prices": {"usd": usd, "usd_foil": foil},
        **extra,
    }
    return json.dumps(card).encode()


PRINTINGS = [
    printing("warp", "4.00"),
    printing("warp", "0.31"),  # the cheap reprint wins
    printing("warp", "0.05", set_type="memorabilia"),  # gold-bordered: not playable
    printing("warp", "0.01", games=["mtgo"]),  # digital only
    printing("warp", "0.02", oversized=True),
    printing("warp", "0.03", set_type="token"),
    printing("foil-only", None, "3.00"),  # no non-foil anywhere: the foil price
    printing("foil-only", None, "2.50"),
    printing("mixed", "9.00", "1.00"),  # non-foil first, as extract_price reads it
    printing("never-priced"),
    printing(None, "0.10"),  # no oracle_id at the top level (reversible layouts)
]

for layout in (
    b"\n".join(PRINTINGS),  # JSONL
    b"[\n" + b",\n".join(PRINTINGS) + b"\n]\n",  # the older array layout
):
    best = dd.cheapest_playable_prices(layout.splitlines(keepends=True))
    assert best == {"warp": 0.31, "foil-only": 2.50, "mixed": 9.00}, best

cards = [
    {
        "name": "Chaos Warp",
        "oracle_id": "warp",
        "prices": {"usd": None, "usd_foil": None},
    },
    {
        "name": "Dear Printing",
        "oracle_id": "warp",
        "prices": {"usd": "4.00", "eur": "3.50"},
    },
    {"name": "Already Cheapest", "oracle_id": "mixed", "prices": {"usd": "9.00"}},
    {"name": "Never Priced", "oracle_id": "never-priced", "prices": {"usd": None}},
    {"name": "No Prices Key", "oracle_id": "foil-only"},
    {"name": "No Oracle Id", "prices": {"usd": "7.00"}},
    # A token: its own token-set printing is cheap, the "playable" ones are promos.
    {"name": "Bird", "oracle_id": "mixed", "prices": {"usd": "0.24"}},
]
assert dd.apply_cheapest_prices(cards, best) == 3
by = {c["name"]: c.get("prices") for c in cards}
assert by["Chaos Warp"]["usd"] == "0.31", by  # unpriced on oracle-cards, now priced
assert by["Dear Printing"] == {"usd": "0.31", "eur": "3.50"}, by  # other fields kept
assert by["Already Cheapest"] == {"usd": "9.00"}
assert by["Never Priced"] == {"usd": None}  # nothing to price it from
assert by["No Prices Key"] == {"usd": "2.50"}
assert by["No Oracle Id"] == {"usd": "7.00"}
assert by["Bird"] == {"usd": "0.24"}  # filled in or lowered, never raised

# The app reads a price through extract_price; it must see the new one.
from app import config  # noqa: E402

config.bootstrap_mtg_utils()
from mtg_utils.card_classify import extract_price  # noqa: E402

assert extract_price(cards[0]) == 0.31 and extract_price(cards[4]) == 2.5

# A failed default-cards download keeps the oracle prices; it must not raise.
try:
    dd._download_cheapest_prices({"data": [{"type": "oracle_cards"}]})
except RuntimeError as e:
    assert "default_cards" in str(e)
else:
    raise AssertionError(
        "a catalog without default_cards should raise for download_bulk to catch"
    )

# And download_bulk does catch it: with the price pass failing, the build still
# writes the cards with oracle-cards' own prices. Scryfall is stubbed.
import tempfile  # noqa: E402
from pathlib import Path  # noqa: E402

ORACLE = [
    {"name": "Chaos Warp", "oracle_id": "warp", "prices": {"usd": None}},
    {"name": "Sol Ring", "oracle_id": "ring", "prices": {"usd": "1.51"}},
]


class _Resp:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(req, **kw):
    if req.full_url.endswith("/bulk-data"):
        catalog = {
            "data": [{"type": "oracle_cards", "download_uri": "https://x/oracle"}]
        }
        return _Resp(json.dumps(catalog).encode())
    return _Resp(json.dumps(ORACLE).encode())


with tempfile.TemporaryDirectory() as tmp:
    dd.BULK_PATH = Path(tmp) / "default-cards.json"
    dd.urlopen = fake_urlopen
    dd.download_bulk()  # the catalog has no default_cards: the pass raises inside
    written = json.loads(dd.BULK_PATH.read_text())
assert [c["prices"] for c in written] == [{"usd": None}, {"usd": "1.51"}], written

print("test_cheapest_prices: ok")
