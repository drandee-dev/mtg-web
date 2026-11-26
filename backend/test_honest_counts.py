"""Self-check: honest Tutors and Card draw counts (audit job 4.2).
Run: python test_honest_counts.py

Tutors no longer counts land search (Cultivate, fetch lands, landcycling), Card
draw no longer counts cycling's reminder text, and a card that sacrifices itself
to draw once (Mind Stone) counts as light. Real bulk index; no network, no cost.
"""

import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

HERE = Path(__file__).parent / "test_fixtures" / "precons"


def counts(slug):
    text = (HERE / f"{slug}.txt").read_text()
    return {c["key"]: c for c in mtg.deck_composition(text)["categories"]}


sliver = counts("sliver-swarm")
assert sliver["tutors"]["count"] == 0, sliver["tutors"]  # was 9, all land search
assert sliver["card-draw"]["count"] == 5, sliver["card-draw"]  # was 8, 3 cycling lands

quill = counts("silverquill-statement")
assert quill["card-draw"]["light"] == 1, quill["card-draw"]  # Mind Stone

idx = mtg._bulk_index()
assert "Draw" in mtg._classify_roles(idx.get("Mind Stone"))  # light keeps its role
assert "Tutor" not in mtg._classify_roles(idx.get("Cultivate"))
assert "Tutor" in mtg._classify_roles(idx.get("Demonic Tutor"))

print("ok: honest counts")
