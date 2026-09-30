"""Self-check: composition thresholds and the wipe target by colour.
Run: python test_thresholds.py

Real bulk index, no network. Decision 8 (audit 2026-09-27): lands are thin below
their target, every other category below 85% of it. The old rule flagged thin
only below 60%, so a deck with 6 of 8 removal or 22 of 36 lands read "ok".
Decision 41: a deck with none of W/U/B/R in its identity gets a wipe target of 1.
"""

import socket
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402
from mtg_utils.theme_presets import get_preset  # noqa: E402


def _no_network(*a, **k):
    raise AssertionError("network call in an offline test")


socket.socket = _no_network  # type: ignore[assignment,misc]
idx = mtg._bulk_index()


def cat(deck, key, fmt="commander"):
    comp = mtg.deck_composition(deck, fmt=fmt)
    return next(c for c in comp["categories"] if c["key"] == key)


def deck(commander, cards, basic=None, basics=0):
    lines = [f"1 {c}" for c in cards]
    if basic:
        lines.append(f"{basics} {basic}")
    return f"Commander\n1 {commander}\nDeck\n" + "\n".join(lines) + "\n"


# --- lands: thin below the target itself ------------------------------------ #
land = lambda n: cat(deck("Krenko, Mob Boss", [], "Mountain", n), "lands")  # noqa: E731
assert land(36)["status"] == "ok", land(36)
assert land(35)["status"] == "thin", land(35)  # old rule: thin only below 22
assert land(30)["status"] == "thin", land(30)

# --- other categories: thin below 85% of the target -------------------------- #
REMOVAL = ["Lightning Bolt", "Chaos Warp", "Abrade", "Stoke the Flames",
           "Flame Slash", "Searing Spear", "Incinerate", "Shock"]  # fmt: skip
full = get_preset("spot-removal")
for n in REMOVAL:
    assert idx.get(n) and full.matches(idx[n]), f"{n} should be full spot removal"
rem = lambda n: cat(deck("Krenko, Mob Boss", REMOVAL[:n]), "removal")  # noqa: E731
assert rem(7)["count"] == 7 and rem(7)["status"] == "ok", rem(7)  # 7 >= 6.8
assert rem(6)["status"] == "thin", rem(6)  # old rule: 6 >= round(4.8) read ok

DRAW = ["Divination", "Opt", "Brainstorm", "Ponder", "Preordain", "Consider",
        "Think Twice", "Deep Analysis", "Rhystic Study"]  # fmt: skip
draw = lambda n: cat(deck("Talrand, Sky Summoner", DRAW[:n]), "card-draw")  # noqa: E731
assert draw(9)["count"] == 9 and draw(9)["status"] == "ok", draw(9)  # 9 >= 8.5
assert draw(8)["status"] == "thin", draw(8)

# --- wipe target by colour (decision 41) ------------------------------------ #
DISK = "Nevinyrral's Disk"
assert get_preset("board-wipe").matches(idx[DISK]), "fixture: the Disk is a full wipe"
for cmdr, target in (
    ("Ezuri, Renegade Leader", 1),  # mono-green
    ("Kozilek, the Great Distortion", 1),  # colorless
    ("Krenko, Mob Boss", 3),  # red
    ("Talrand, Sky Summoner", 3),  # blue (mass bounce counts)
    ("Atraxa, Praetors' Voice", 3),  # green plus W/U/B
):
    w = cat(deck(cmdr, [DISK]), "board-wipe")
    assert w["target"] == target, (cmdr, w)
    assert w["status"] == ("ok" if target == 1 else "thin"), (cmdr, w)

# --- no targets outside commander formats ----------------------------------- #
std = cat("4 Lightning Bolt\n20 Mountain\n", "removal", fmt="standard")
assert std["target"] is None and std["status"] == "ok", std

print("test_thresholds: ok")
