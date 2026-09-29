"""Self-check: EDHREC picks this commander's decks avoid are dropped everywhere.
Run: python test_negative_synergy.py

Hermetic: the HTTP get is stubbed, so it needs no network. Decision 7 (audit
2026-09-27): drop a pick when synergy < 0 AND inclusion < 30%, inclusion being
num_decks / potential_decks (the payload's own `inclusion` is always 0). Real
EDHREC data had Lightning Bolt 5th among Krenko's instants at synergy -0.07 and
29% inclusion, and The One Ring among Atraxa's artifacts at -0.10 and 8%. Both
fed the generator skeleton and the deck view's recommendations panel.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import requests  # noqa: E402

from app import mtg  # noqa: E402


def cv(name, synergy, num, potential=100):
    return {
        "name": name,
        "synergy": synergy,
        "num_decks": num,
        "potential_decks": potential,
        "inclusion": 0,
    }


# (card, expected kept) - real names, so the skeleton's bulk lookup keeps them.
CASES = [
    (cv("Lightning Bolt", -0.07, 29), False),  # the real Krenko row
    (cv("The One Ring", -0.10, 8), False),  # the real Atraxa row
    (cv("Shock", -0.01, 0, potential=0), False),  # no deck data, negative
    (cv("Counterspell", -0.07, 30), True),  # exactly 30% is not under 30%
    (cv("Sol Ring", -0.40, 80), True),  # negative but widely played
    (cv("Brainstorm", 0.0, 2), True),  # zero synergy is not negative
    (cv("Ponder", 0.25, 3), True),  # positive synergy, rare
]
KEEP = {c["name"] for c, keep in CASES if keep}
DROP = {c["name"] for c, keep in CASES if not keep}
PAGE = {
    "container": {
        "json_dict": {
            "cardlists": [
                {"tag": tag, "cardviews": [c for c, _ in CASES]}
                for tag in ("highsynergycards", "topcards", "instants", "lands")
            ]
        }
    }
}


class FakeResp:
    status_code = 200

    def json(self):
        return PAGE

    def raise_for_status(self):
        pass


requests.Session.get = lambda self, url, **kw: FakeResp()


def names(cats):
    return {c["name"] for cards in cats.values() for c in cards}


# 1. The shared lookup itself.
got = mtg.edhrec_lookup(["Krenko, Mob Boss"])
assert names(got) == KEEP, sorted(names(got) ^ KEEP)
for key in ("high_synergy", "top_cards", "instants", "lands"):
    assert {c["name"] for c in got[key]} == KEEP, key

# 2. The generator skeleton (every EDHREC list it reads).
sk = mtg.wizard_build_skeleton("Krenko, Mob Boss", bracket=4)["skeleton"]
edhrec_names = names(
    {k: v for k, v in sk.items() if k not in ("staples", "suggested_lands")}
)
assert edhrec_names == KEEP, sorted(edhrec_names ^ KEEP)

# 3. The deck view's recommendations panel.
rec = mtg.deck_recommendations("Commander\n1 Krenko, Mob Boss\nDeck\n1 Mountain\n")
assert names(rec["categories"]) == KEEP, sorted(names(rec["categories"]) ^ KEEP)
assert not DROP & names(rec["categories"])

print(f"test_negative_synergy: ok (kept {len(KEEP)}, dropped {sorted(DROP)})")
