"""Self-check for the commander deck-size ceiling and analyze's card count.
Run from backend/: python test_deck_size_legality.py

Uses the real bulk card index on disk through the real analyze path
(parse -> hydrate -> legality_audit). No network, no cost.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402


def cmdr_deck(n_forests):
    return f"Commander\n1 Atraxa, Praetors' Voice\nDeck\n{n_forests} Forest"


# --- 1 + 99: exactly 100, total includes the commander --------------------- #
ok = mtg.analyze_deck(cmdr_deck(99), fmt="commander")
assert ok["total_cards"] == 100, ok["total_cards"]
assert ok["legality"]["violations"]["deck_maximum"] == [], ok["legality"]
assert ok["legality"]["overall_status"] == "PASS", ok["legality"]

# --- 1 + 100: one over, must fail on the size ceiling ---------------------- #
over = mtg.analyze_deck(cmdr_deck(100), fmt="commander")
assert over["total_cards"] == 101, over["total_cards"]
assert over["legality"]["overall_status"] == "FAIL", over["legality"]
v = over["legality"]["violations"]["deck_maximum"]
assert v == [{"total_cards": 101, "maximum": 100, "reason": "above_maximum"}], v
assert over["legality"]["counts"]["deck_maximum"] == 1

# --- constructed formats have no ceiling ----------------------------------- #
for n in (60, 80):
    modern = mtg.analyze_deck(f"{n} Forest", fmt="modern")
    assert modern["legality"]["violations"]["deck_maximum"] == [], modern["legality"]
    assert modern["legality"]["overall_status"] == "PASS", modern["legality"]

print("test_deck_size_legality: OK")
