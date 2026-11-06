"""Self-check for deck import by URL and the parser's Companion section (2026-11-06).
Run: python test_import_url.py

Found that day: every Moxfield import came back empty (the v3 API moved each board
under data["boards"][key]["cards"]); Archidekt's format numbers were wrong (7 is
Custom, Pioneer is 15, Pauper EDH 17); a companion counted as one of a Commander
deck's 100. The fake responses copy the real shapes fetched that day. No network.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import requests  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from mtg_utils.parse_deck import parse_deck_text  # noqa: E402

client = TestClient(main.app)


class Resp:
    def __init__(self, data):
        self.status_code, self._data = 200, data

    def json(self):
        return self._data


def imported(url, data):
    real = requests.get
    requests.get = lambda *a, **k: Resp(data)
    try:
        r = client.post("/api/deck/import-url", json={"url": url})
    finally:
        requests.get = real
    assert r.status_code == 200, r.text
    return r.json()


def board(*cards):
    """One Moxfield v3 board: {"cards": {id: {quantity, card: {name}}}}."""
    return {"count": sum(q for q, _ in cards),
            "cards": {f"id{i}": {"quantity": q, "boardType": "x", "card": {"name": n}}
                      for i, (q, n) in enumerate(cards)}}


# --- Moxfield, the v3 shape --------------------------------------------------- #
mox = {
    "name": "Partners PDH", "format": "pauperEdh",
    "boards": {
        "commanders": board((1, "Rograkh, Son of Rohgahh"), (1, "Silas Renn, Seeker Adept")),
        "mainboard": board((97, "Island"), (1, "Brainstorm")),
        "companions": board((1, "Jegantha, the Wellspring")),
        "sideboard": board((1, "Counterspell")),
        "maybeboard": board((2, "Ponder")),
        "signatureSpells": board(),
    },
}
d = imported("https://www.moxfield.com/decks/abc", mox)
assert d["format"] == "paupercommander", d["format"]
lines = d["decklist"].splitlines()
assert lines[:4] == ["Commander", "1 Rograkh, Son of Rohgahh", "1 Silas Renn, Seeker Adept", "Deck"], lines
assert lines[4:] == ["97 Island", "1 Brainstorm"], lines
assert d["sideboard"].splitlines() == ["1 Jegantha, the Wellspring", "1 Counterspell", "2 Ponder"], d["sideboard"]
parsed = parse_deck_text(d["decklist"], format="paupercommander")
assert parsed["total_cards"] == 100, parsed["total_cards"]
# The old top-level shape still reads.
old = {"name": "Old", "format": "commander",
       "commanders": board((1, "Atraxa, Praetors' Voice"))["cards"],
       "mainboard": board((99, "Forest"))["cards"]}
d = imported("https://www.moxfield.com/decks/old", old)
assert d["decklist"].splitlines() == ["Commander", "1 Atraxa, Praetors' Voice", "Deck", "99 Forest"], d
print("ok: Moxfield v3 boards read; partners share one Commander block; companion goes to Considering")

# --- Archidekt ---------------------------------------------------------------- #
def arch_card(qty, name, *cats):
    return {"quantity": qty, "categories": list(cats), "card": {"oracleCard": {"name": name}}}


arch = {
    "name": "Arch", "deckFormat": 17,
    "categories": [{"name": "Commander", "includedInDeck": True},
                   {"name": "Companion", "includedInDeck": True},
                   {"name": "Lands", "includedInDeck": True}],
    "cards": [arch_card(97, "Island", "Lands"), arch_card(1, "Rograkh, Son of Rohgahh", "Commander"),
              arch_card(1, "Silas Renn, Seeker Adept", "Commander"),
              arch_card(1, "Jegantha, the Wellspring", "Companion"), arch_card(1, "Brainstorm", "Draw")],
}
d = imported("https://archidekt.com/decks/123/x", arch)
assert d["format"] == "paupercommander", d["format"]
assert d["decklist"].splitlines()[:4] == ["Commander", "1 Rograkh, Son of Rohgahh", "1 Silas Renn, Seeker Adept", "Deck"], d
assert "Jegantha" not in d["decklist"] and d["sideboard"] == "1 Jegantha, the Wellspring", d
assert parse_deck_text(d["decklist"], format="paupercommander")["total_cards"] == 100
for number, fmt in ((7, "commander"), (15, "pioneer"), (17, "paupercommander"), (6, "pauper")):
    assert imported("https://archidekt.com/decks/1/x", {**arch, "deckFormat": number})["format"] == fmt, number
print("ok: Archidekt format numbers (7 Custom, 15 Pioneer, 17 Pauper EDH); companion goes to Considering")

# --- a pasted list with a Companion section ------------------------------------ #
ARENA = ("Companion\n1 Jegantha, the Wellspring\n\nCommander\n1 Atraxa, Praetors' Voice\n\n"
         "Deck\n98 Forest\n1 Sol Ring")
p = parse_deck_text(ARENA, format="commander")
assert p["total_cards"] == 100 and [c["name"] for c in p["companions"]] == ["Jegantha, the Wellspring"], p
assert all(c["name"] != "Jegantha, the Wellspring" for c in p["cards"]), p["cards"]
# Constructed: Arena also lists the companion in the sideboard, so the section adds nothing.
p = parse_deck_text("Companion\n1 Lurrus of the Dream-Den\n\nDeck\n60 Island\n\nSideboard\n1 Lurrus of the Dream-Den",
                    format="legacy")
assert p["total_cards"] == 60 and p["total_sideboard"] == 1, (p["total_cards"], p["total_sideboard"])
# Moxfield's text export marks it "//Companion".
p = parse_deck_text("//Commander\n1 Atraxa, Praetors' Voice\n//Companion\n1 Jegantha, the Wellspring\n//Mainboard\n99 Forest",
                    format="commander")
assert p["total_cards"] == 100 and len(p["companions"]) == 1, p
print("ok: a pasted Companion section is kept apart and not counted")

# --- the sideboard depends on format (Andres, 2026-11-06) ---------------------- #
# Constructed keeps it as a Sideboard section of the deck; Commander sends it to
# Considering (the PDH case above). Maybeboard and companion always go to Considering.
mox_modern = {"name": "Modern", "format": "modern", "boards": {
    "commanders": board(), "mainboard": board((56, "Island"), (4, "Brainstorm")),
    "sideboard": board((15, "Pyroblast")), "maybeboard": board((1, "Ponder")),
    "companions": board((1, "Jegantha, the Wellspring")), "signatureSpells": board()}}
d = imported("https://www.moxfield.com/decks/modern", mox_modern)
assert d["decklist"].splitlines() == ["56 Island", "4 Brainstorm", "Sideboard", "15 Pyroblast"], d
assert d["sideboard"].splitlines() == ["1 Jegantha, the Wellspring", "1 Ponder"], d
p = parse_deck_text(d["decklist"], format="modern")
assert (p["total_cards"], p["total_sideboard"]) == (60, 15), p
arch_modern = {"name": "A", "deckFormat": 2, "categories": [], "cards": [
    arch_card(60, "Island", "Lands"), arch_card(15, "Pyroblast", "Sideboard"), arch_card(1, "Ponder", "Maybeboard")]}
d = imported("https://archidekt.com/decks/2/x", arch_modern)
assert d["decklist"].splitlines() == ["60 Island", "Sideboard", "15 Pyroblast"], d
assert d["sideboard"] == "1 Ponder", d
# Commander still sends a Sideboard category to Considering.
d = imported("https://archidekt.com/decks/3/x", {**arch_modern, "deckFormat": 3})
assert "Sideboard" not in d["decklist"] and "15 Pyroblast" in d["sideboard"], d
print("ok: a constructed import keeps its sideboard; Commander sends it to Considering")

# --- the Considering pile stays out of exports and counts (2026-11-06) ---------- #
# The web app saves Considering under a "Maybeboard" header. Unknown to the parser,
# the header read as a card named "Maybeboard" and the pile as main-deck cards, so
# every export carried both.
from app import mtg  # noqa: E402

stored = "Commander\n1 Atraxa, Praetors' Voice\nDeck\n98 Plains\n1 Sol Ring\nMaybeboard\n2 Swords to Plowshares"
p = parse_deck_text(stored, format="commander")
assert p["total_cards"] == 100 and [c["name"] for c in p["maybeboard"]] == ["Swords to Plowshares"], p
out = mtg.export_deck_text(stored, fmt="commander")
assert "Swords to Plowshares" not in out and "Maybeboard" not in out, out
legacy = "Deck\n56 Island\n4 Brainstorm\nSideboard\n15 Pyroblast\nMaybeboard\n1 Ponder"
out = mtg.export_deck_text(legacy, fmt="legacy")
assert "Ponder" not in out and "Maybeboard" not in out and "15 Pyroblast" in out, out
p = parse_deck_text("//Mainboard\n60 Island\n//Maybeboard\n1 Ponder", format="legacy")
assert p["total_cards"] == 60, p
print("ok: a Maybeboard (Considering) section is left out of exports and counts")
