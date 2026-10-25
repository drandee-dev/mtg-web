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

idx = mtg._bulk_index()
res = mtg.budget_swaps(DECK, fmt="commander")
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

# A card with no role has no job to repeat: it gets no swap at all.
swapped = {s["card"] for s in swaps}
for name in ("Torment of Hailfire", "Reanimate", "Make an Example", "Twinning Staff"):
    assert not mtg._classify_roles(idx.get(name)), f"{name} now has a role; pick another"
    assert name not in swapped, f"{name} has no role but was swapped"

print(f"ok: {len(swaps)} like-for-like swaps, no repeats, none for role-less cards")
