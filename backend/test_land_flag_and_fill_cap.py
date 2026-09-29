"""Self-check: skeleton and fill entries carry is_land, and fills stop at the gap.
Run: python test_land_flag_and_fill_cap.py

Uses the real bulk card index on disk. No network (sockets are disabled below),
no AI call: EDHREC and the combo lookup are stubbed, and fills run the no-key
fallback.

Decision 29 (audit 2026-09-27): MDFCs with a land face count as lands. EDHREC
lists them under spell categories (Malakir Rebirth in instants, Bala Ged
Recovery in sorceries), so the client can't tell from the category; the
backend flags them. Fill overshoot: every thin category used to get up to four
suggestions whatever the gap (board wipes 0 -> 4 against a target of 3), and
each extra now costs the deck a starting card.
"""

import os
import socket
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402


def _no_network(*a, **k):
    raise AssertionError("network call in an offline test")


socket.socket = _no_network  # type: ignore[assignment,misc]
os.environ.pop("ANTHROPIC_API_KEY", None)


# --- skeleton ---------------------------------------------------------------- #
def entry(name):
    return {"name": name, "synergy": 0.1, "num_decks": 100, "potential_decks": 1000}


mtg.edhrec_lookup = lambda names: {
    "instants": [entry("Malakir Rebirth")],
    "sorceries": [entry("Bala Ged Recovery")],
    "high_synergy": [entry("Wirewood Lodge"), entry("Llanowar Elves")],
    "lands": [entry("Command Tower")],
}
r = mtg.wizard_build_skeleton("Atraxa, Praetors' Voice")
assert not r["error"], r
flags = {c["name"]: c.get("is_land") for cards in r["skeleton"].values() for c in cards}
expect = {
    "Malakir Rebirth": True,
    "Bala Ged Recovery": True,
    "Wirewood Lodge": True,
    "Command Tower": True,
    "Llanowar Elves": False,
    "Sol Ring": False,
}
for name, want in expect.items():
    assert flags.get(name) is want, (name, flags.get(name))

# --- fills ------------------------------------------------------------------- #
mtg.combo_search = lambda hd: {}


def fills(deck):
    r = mtg.ai_composition_fills(deck)
    assert not r["error"] and r["fills"], r
    return {f["category"]: f for f in r["fills"]}


HEAD = "Commander\n1 Atraxa, Praetors' Voice\nDeck\n"
f = fills(HEAD + "1 Forest\n")
assert "Lands" in f and "Board wipes" in f, sorted(f)
for cat, fill in f.items():
    for e in (*fill["suggestions"], *fill["pool"]):
        assert isinstance(e.get("is_land"), bool), (cat, e)
    if cat == "Lands":
        assert fill["suggestions"], fill
        assert all(e.get("is_land") is True for e in fill["pool"]), fill
assert all(s.get("is_land") is False for s in f["Card draw"]["suggestions"])
seen = {e["name"]: e.get("is_land") for x in f.values() for e in x["pool"]}
for name, want in {
    "Command Tower": True,
    "Fell the Profane // Fell Mire": True,  # MDFC in the spot-removal pool
    "Sol Ring": False,
}.items():
    assert seen.get(name) is want, (name, seen.get(name))

# Board wipes: 0 of 3 -> at most 3 suggestions; 1 of 3 -> at most 2.
wipes = f["Board wipes"]
assert len(wipes["pool"]) > 3, "fixture can't exhibit the overshoot"
assert len(wipes["suggestions"]) == 3, len(wipes["suggestions"])
f1 = fills(HEAD + "1 Forest\n1 Wrath of God\n")
assert len(f1["Board wipes"]["suggestions"]) == 2, f1["Board wipes"]["suggestions"]
assert len(f1["Board wipes"]["pool"]) > 2, "the pool stays whole"
# A wide gap is not capped below the old four.
assert len(f["Card draw"]["suggestions"]) == 4

print("test_land_flag_and_fill_cap: ok")
