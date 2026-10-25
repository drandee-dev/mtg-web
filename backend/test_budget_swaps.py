"""Self-check for budget_swaps: an alternative must be a like-for-like card.
Run: python test_budget_swaps.py

Uses the real bulk card index on disk; no network, no AI. It asserts invariants of
whatever swaps come back, so it does not depend on today's prices. The 2026-10-23
failure: the cheapest card of the same type line (or role) was offered whatever it was,
so Esper Sentinel (1 mana) was swapped for a 6-mana Tithebearer Giant, and one card
could be proposed as the add for six different cuts.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

DECK = """Commander
1 Silverquill, the Disputant

Deck
1 Esper Sentinel
1 Torment of Hailfire
1 Bitterblossom
1 Phyrexian Tower
1 Deadly Rollick
1 Dictate of Erebos
1 Charismatic Conqueror
1 Black Market Connections
1 Vault of Champions
1 Cabal Stronghold
1 Godless Shrine
1 Bleachbone Verge
1 Insatiable Avarice
1 Reanimate
1 Make an Example
1 Twinning Staff
1 Jet Medallion
1 Pearl Medallion
"""

_edhrec_calls: list[tuple] = []


def _edhrec_down(names, timeout=None):
    _edhrec_calls.append((list(names), timeout))
    raise ConnectionError("EDHREC down (stub)")


# The like-for-like rules first, on global popularity: EDHREC is stubbed as down, so
# this section is hermetic and doubles as the fallback check.
mtg.edhrec_lookup = _edhrec_down
mtg._cardlists_cache.clear()

idx = mtg._bulk_index()
res = mtg.budget_swaps(DECK, fmt="commander")
assert res["ranked_by"] == "global" and res["v"] == mtg.BUDGET_SWAPS_VERSION, res
assert _edhrec_calls == [(["Silverquill, the Disputant"], 3)], _edhrec_calls
swaps = res["swaps"]
assert len(swaps) >= 3, f"expected several swaps from this deck, got {swaps}"

adds = [s["alternative"]["name"] for s in swaps]
assert len(adds) == len(set(adds)), f"one card proposed as the add twice: {adds}"

in_deck = {line.split(" ", 1)[1] for line in DECK.splitlines() if line[:1].isdigit()}
for s in swaps:
    old = idx.get(s["card"])
    new = idx.get(s["alternative"]["name"])
    label = f"{s['card']} -> {s['alternative']['name']}"
    assert old and new, label
    assert mtg._swap_type(new) == mtg._swap_type(old), f"different kind of card: {label}"
    assert abs(new["cmc"] - old["cmc"]) <= 1, f"cost differs by more than 1: {label}"
    assert s["alternative"]["price"] < s["price"] * 0.5, f"not cheaper enough: {label}"
    assert s["alternative"]["name"] not in in_deck, f"already in the deck: {label}"
    assert set(new.get("color_identity") or []) <= {"W", "B"}, f"off colour: {label}"
    assert mtg._classify_roles(old), f"a card with no role got a swap: {label}"
    rank = new.get("edhrec_rank")
    assert rank is not None and rank < 8000, f"an unplayed card as the swap: {label} ({rank})"

# A land must tap for every coloured mana the original does (Vault of Champions is W/B).
for s in swaps:
    old, new = idx.get(s["card"]), idx.get(s["alternative"]["name"])
    if mtg._swap_type(old) == "land":
        assert mtg._land_swap_ok(old, new), f"a worse-mana land: {s['card']} -> {new['name']}"
assert not mtg._land_swap_ok(idx["Vault of Champions"], idx["Reliquary Tower"])  # colourless
assert not mtg._land_swap_ok(idx["Godless Shrine"], idx["Rogue's Passage"])
assert mtg._land_swap_ok(idx["Godless Shrine"], idx["Exotic Orchard"])  # taps for W and B
assert mtg._land_swap_ok(idx["Godless Shrine"], idx["Evolving Wilds"])  # a fetch finds them

# A card with no role has no job to repeat: it gets no swap at all.
swapped = {s["card"] for s in swaps}
for name in ("Torment of Hailfire", "Reanimate", "Make an Example", "Twinning Staff"):
    assert not mtg._classify_roles(idx.get(name)), f"{name} now has a role; pick another"
    assert name not in swapped, f"{name} has no role but was swapped"

print(f"ok: {len(swaps)} like-for-like swaps, no repeats, none for role-less cards")


# --- commander-aware ranking (job 1, 2026-10-24) -------------------------- #
def cv(name, decks, of=1000):
    return {"name": name, "synergy": 0.2, "inclusion": 0, "num_decks": decks, "potential_decks": of}


def page(of=1000):
    """A Silverquill-shaped EDHREC page: the shape edhrec_lookup returned live on
    2026-10-24 (per-type lists; high_synergy empty for this commander)."""
    return {
        "high_synergy": [],
        "creatures": [cv("Cruel Celebrant", 340, of)],
        # EDHREC names a double-faced card by its front face only.
        "instants": [cv("Fell the Profane", 240, of)],
        "utility_lands": [cv("Phyrexian Tower", 310, of), cv("Midgar, City of Mako", 180, of)],
        "lands": [cv("Fetid Heath", 530, of)],
    }


def run_with(pg, deck=DECK):
    calls = []

    def stub(names, timeout=None):
        calls.append((list(names), timeout))
        return pg

    mtg.edhrec_lookup = stub
    mtg._cardlists_cache.clear()
    out = mtg.budget_swaps(deck, fmt="commander")
    return out, {s["card"]: s["alternative"] for s in out["swaps"]}, calls


out, by, calls = run_with(page())
assert out["ranked_by"] == "commander", out
# This commander's pick beats the globally more popular one (Blood Artist on global rank).
assert by["Charismatic Conqueror"]["name"] == "Cruel Celebrant", by["Charismatic Conqueror"]
assert by["Charismatic Conqueror"]["commander_pct"] == 34, by["Charismatic Conqueror"]
# The front-face name on EDHREC still counts for the double-faced card.
assert by["Deadly Rollick"]["name"] == "Fell the Profane // Fell Mire", by["Deadly Rollick"]
assert by["Deadly Rollick"]["commander_pct"] == 24, by["Deadly Rollick"]
# A utility land of this commander is swapped for another of its utility lands, not for
# the more played dual; a plain dual still gets the commander's most played land.
assert by["Phyrexian Tower"]["name"] == "Midgar, City of Mako // Reactor Raid", by["Phyrexian Tower"]
assert by["Vault of Champions"]["name"] == "Fetid Heath", by["Vault of Champions"]
# Like-for-like still holds under the new ranking.
for card, alt in by.items():
    old, new = idx.get(card), idx.get(alt["name"])
    assert mtg._swap_type(new) == mtg._swap_type(old), (card, alt)
    assert abs(new["cmc"] - old["cmc"]) <= 1, (card, alt)
    if mtg._swap_type(old) == "land":
        assert mtg._land_swap_ok(old, new), (card, alt)
print("ok: commander picks first, face names match, utility lands stay utility")

# Under 100 decks a commander's shares are noise: global ranking, no percentages.
out, by, _ = run_with(page(of=12))
assert out["ranked_by"] == "global", out
assert all(a["commander_pct"] is None for a in by.values()), by

# Partners: both names go to EDHREC, which pages the pairing.
PARTNERS = "Commander\n1 Thrasios, Triton Hero\n1 Tymna the Weaver\n\nDeck\n1 Esper Sentinel\n"
_, _, calls = run_with(page(), deck=PARTNERS)
assert calls == [(["Thrasios, Triton Hero", "Tymna the Weaver"], 3)], calls

# One fetch serves Suggestions and swaps, and Suggestions' in_deck marks never leak
# into the shared cache.
_, _, calls = run_with(page())
rec = mtg.deck_recommendations(DECK, fmt="commander")
assert len(calls) == 1, f"Suggestions fetched EDHREC again: {calls}"
assert rec["categories"]["creatures"][0]["in_deck"] is False, rec
cached = next(iter(mtg._cardlists_cache.values()))[1]
assert "in_deck" not in cached["creatures"][0], cached
print("ok: sample floor, partners, shared cache without leaks")
