"""Self-check: the theme reading on the audit's four stock precons.
Run: python test_theme_reading.py   (add -v to print each deck's prompt block)

Audit job 3.1 (vault projects/mtg-web-audit-2026-11-25.md). Real bulk card index on
disk; EDHREC and combos stubbed, so no network and no cost.
"""

import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg
from app.theme import card_text, read_theme

mtg.combo_search = lambda hd: {}
mtg.edhrec_lookup = lambda names, timeout=None: {}
VERBOSE = "-v" in sys.argv
PRECONS = Path(__file__).parent / "test_fixtures" / "precons"
idx = mtg._bulk_index()


def ctx_for(slug):
    mtg._ctx_cache.clear()
    mtg._cardlists_cache.clear()
    ctx = mtg._deck_context((PRECONS / f"{slug}.txt").read_text(), "commander")
    if VERBOSE:
        print(f"--- {slug}\n{ctx['theme'].prompt_text()}\n")
    return ctx


def roles_of(theme, name):
    return [r for r, cards in theme.roles.items() if name in cards]


def protected(theme):
    return {n for cards in theme.roles.values() for n in cards}


# Cards whose only "sacrifice" is paying with themselves: never protected, never on theme.
SELF_SAC = [
    "Evolving Wilds",
    "Mind Stone",
    "Flood Plain",
    "Grasslands",
    "Mountain Valley",
    "Rocky Tar Pit",
    "Commander's Sphere",
    "Myriad Landscape",
    "Terramorphic Expanse",
]

# --- Sliver Swarm: the case that cut seven Slivers --------------------------- #
ctx = ctx_for("sliver-swarm")
t = ctx["theme"]
assert t.tribe == "sliver" and t.tribe_named, t
keys = {m.key for m in t.mechanics}
# Encore's reminder text says "token" and "Sacrifice"; the card itself is neither.
assert not keys & {"sacrifice", "tokens"}, keys
slivers = [
    r["name"] for r in ctx["hd"].records if r and "sliver" in r["type_line"].lower()
]
assert len(slivers) >= 40, len(slivers)
for name in [
    *slivers,
    "Icon of Ancestry",
    "Herald's Horn",
    "Realmwalker",
    "Path of Ancestry",
]:
    assert t.on_theme(idx.get(name)), f"{name} should be on theme"
for name in ["Diffusion Sliver", "Shifting Sliver"]:  # in 83% and 80% of its decks
    assert roles_of(t, name), (name, t.roles.keys())
for name in [*SELF_SAC, "Sol Ring", "Windfall", "Cultivate"]:
    if idx.get(name):
        assert not t.on_theme(idx.get(name)), f"{name} should not be on theme"
assert not protected(t) & set(SELF_SAC), protected(t) & set(SELF_SAC)
assert "trust this" not in ctx["summary"] and "Tribe: Sliver" in ctx["summary"]
print("ok: Sliver Swarm reads as Slivers, encore's reminder text is ignored")

# --- Veloci-Ramp-Tor: Dinosaurs and discover --------------------------------- #
ctx = ctx_for("veloci-ramp-tor")
t = ctx["theme"]
assert t.tribe == "dinosaur" and t.tribe_named, t
keys = {m.key for m in t.mechanics}
assert {"discover", "etb"} <= keys and not keys & {"sacrifice", "tokens"}, keys
for name in ["Regisaur Alpha", "Thundering Spineback", "Bellowing Aegisaur"]:
    assert t.on_theme(idx.get(name)), name
assert not protected(t) & set(SELF_SAC), protected(t) & set(SELF_SAC)
print("ok: Veloci-Ramp-Tor reads as Dinosaurs with discover")

# --- Undead Unleashed: Zombies, death and sacrifice --------------------------- #
ctx = ctx_for("undead-unleashed")
t = ctx["theme"]
assert t.tribe == "zombie" and t.tribe_named, t
keys = {m.key for m in t.mechanics}
assert {"death", "sacrifice", "tokens"} <= keys, keys
for name in ["Fleshbag Marauder", "Butcher of Malakir", "Diregraf Captain"]:
    assert t.on_theme(idx.get(name)), name
assert not protected(t) & set(SELF_SAC), protected(t) & set(SELF_SAC)
print("ok: Undead Unleashed reads as Zombies with death and sacrifice")

# --- Silverquill Statement: no tribe, counters and politics ------------------- #
ctx = ctx_for("silverquill-statement")
t = ctx["theme"]
assert t.tribe is None, t.tribe  # 10 Humans in ~30 creatures is incidental, not a tribe
keys = {m.key for m in t.mechanics}
assert {"counters", "attacks", "politics"} <= keys and "sacrifice" not in keys, keys
assert "Mind Stone" not in protected(t)
print("ok: Breena reads as counters, attacks and politics, no tribe")

# --- the pieces, on single cards --------------------------------------------- #
assert "sacrifice" not in card_text(idx.get("Evolving Wilds"))
assert "sacrifice" in card_text(idx.get("Fleshbag Marauder"))
assert "token" not in card_text(idx.get("Sliver Gravemother"))
# Majority tribe with no commander naming it; changelings don't make a tribe alone.
elves = [
    idx.get(n)
    for n in [
        "Llanowar Elves",
        "Elvish Mystic",
        "Fyndhorn Elves",
        "Elvish Archdruid",
        "Elvish Visionary",
        "Priest of Titania",
        "Elvish Champion",
        "Imperious Perfect",
    ]
]
assert all(elves), [n for n, r in zip("12345678", elves) if not r]
t = read_theme([idx.get("Breena, the Demagogue")], elves)
assert t.tribe == "elf" and not t.tribe_named, t
assert (
    read_theme([idx.get("Breena, the Demagogue")], elves[:7]).tribe is None
)  # under 8
print("ok: a deck's own majority type counts at 8+, the text pieces strip as intended")
