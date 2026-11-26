"""Self-check: one land target (audit job 4.1).
Run: python test_land_target.py

Composition's Lands row, the Mana base panel's land floor and the generator's
skeleton all use mana_audit's land_count_floor. Sliver Swarm (five colours,
Sliver Gravemother at mana value 5) has a floor of 41, not the old 36 or 27.
Real bulk index; EDHREC stubbed; no network, no cost.
"""

import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

mtg.edhrec_lookup = lambda names, timeout=None: {}
text = (
    Path(__file__).parent / "test_fixtures" / "precons" / "sliver-swarm.txt"
).read_text()

floor = mtg.analyze_deck(text)["mana"]["land_count_floor"]
assert floor == 41, floor

lands = next(c for c in mtg.deck_composition(text)["categories"] if c["key"] == "lands")
assert lands["target"] == floor, lands
assert lands["status"] == "thin" and lands["count"] == 37, lands

via = mtg.analyze_deck(text)["mana"]["viability"]
assert via["land_floor"] == floor, via
assert via["land_status"] == "WARN", via  # 37 of 41 is within the warn band

sk = mtg.wizard_build_skeleton("Sliver Gravemother")
assert sk["land_target"] == floor, sk.get("land_target")

# A Commander deck is always the format's 100, even if it declares another size, so
# the floor and the Sources check agree (audit job 5.7; it used to scale to 33).
from mtg_utils.mana_audit import mana_audit

odd = mtg.HydratedDeck.from_parsed(
    mtg.parse_deck_text(text, format="commander", deck_size=80), mtg._bulk_index()
)
assert mana_audit(odd)["land_count_floor"] == floor, mana_audit(odd)["land_count_floor"]

print("ok: one land target,", floor)
