"""Self-check: the theme reading reaches the page (audit job 6.1).
Run: python test_theme_out.py

Composition carries a `theme` list (tribe first) and each recommend row a
`theme_tag`, both from the same read_theme the AI context uses.
Real bulk index; EDHREC stubbed; no network, no cost.
"""

import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

mtg.edhrec_lookup = lambda names, timeout=None: {}
PRECONS = Path(__file__).parent / "test_fixtures" / "precons"


def theme(name: str) -> list[dict]:
    return mtg.deck_composition((PRECONS / f"{name}.txt").read_text())["theme"]


sliver = theme("sliver-swarm")
# 42 Slivers (changelings included) and 14 cards that support them.
assert sliver[0] == {"label": "Slivers", "count": 56, "creatures": 42}, sliver
assert all(set(g) == {"label", "count", "creatures"} and g["count"] > 0 for g in sliver)

dino = theme("veloci-ramp-tor")
assert dino[0]["label"] == "Dinosaurs" and dino[0]["creatures"] == 35, dino
assert [g["creatures"] for g in dino[1:]] == [None] * (len(dino) - 1), dino
zombie = theme("undead-unleashed")[0]
assert zombie["label"] == "Zombies" and 0 < zombie["creatures"] < zombie["count"], (
    zombie
)
# Breena names no creature type: groups, but no tribe.
breena = theme("silverquill-statement")
assert breena and all(g["creatures"] is None for g in breena), breena

# Not a commander format's concern, and never a crash on an empty list.
assert mtg.deck_composition("")["theme"] == []

# Recommend rows: a Sliver reads "Sliver", a tribe-support card too, a staple nothing.
mtg._edhrec_cardlists = lambda commanders: {
    "high_synergy": [
        {"name": "Sliver Legion"},
        {"name": "Kindred Discovery"},
        {"name": "Sol Ring"},
        {"name": "Not A Real Card"},
    ]
}
rows = mtg.deck_recommendations((PRECONS / "sliver-swarm.txt").read_text())
tags = {r["name"]: r["theme_tag"] for r in rows["categories"]["high_synergy"]}
assert tags == {
    "Sliver Legion": "Sliver",
    "Kindred Discovery": "Sliver",
    "Sol Ring": None,
    "Not A Real Card": None,
}, tags

print("ok: theme out,", sliver)
