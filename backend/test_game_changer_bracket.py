"""Self-check: generated decks respect the game-changer rule for the target bracket.
Run: python test_game_changer_bracket.py

Uses the real bulk card index on disk. No network (sockets are disabled below),
no AI call: EDHREC and the combo lookup are stubbed, and fills run the no-key
fallback that serves the verified candidate pool directly.

Decisions 5 and 13 (audit 2026-09-27): auto and brackets 1-2 get no game
changers; bracket 3 gets at most three, all from the skeleton, and fills never
add one below bracket 4; brackets 4-5 are unlimited. Before this, the skeleton
only echoed `bracket` back and fills offered The One Ring and friends at any
bracket.
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
idx = mtg._bulk_index()


def is_gc(name):
    rec = idx.get(name)
    assert rec, f"{name!r} not in bulk"
    return bool(rec.get("game_changer"))


# --- skeleton ---------------------------------------------------------------- #
GC_PLAYS = {  # real game changers, distinct popularity
    "Rhystic Study": 9000,
    "Smothering Tithe": 7000,
    "Cyclonic Rift": 5000,
    "The One Ring": 3000,
    "Demonic Tutor": 1000,
}
LAND_GC = ("Gaea's Cradle", 8000)
PLAIN = [
    "Counterspell",
    "Brainstorm",
    "Ponder",
    "Llanowar Elves",
    "Wrath of God",
    "Swords to Plowshares",
    "Mind Stone",
    "Reliquary Tower",
]
for n in GC_PLAYS:
    assert is_gc(n), f"{n} should be a game changer in bulk"
assert is_gc(LAND_GC[0])
for n in PLAIN:
    assert not is_gc(n), f"{n} should not be a game changer in bulk"
assert not any(is_gc(n) for n in ("Sol Ring", "Arcane Signet", "Command Tower"))


def entry(name, plays):
    return {"name": name, "synergy": 0.1, "num_decks": plays, "potential_decks": 10000}


FAKE_EDHREC = {
    # Rhystic Study is listed twice: it counts once toward the cap.
    "high_synergy": [
        entry("Rhystic Study", 9000),
        entry("Counterspell", 8500),
        entry("Demonic Tutor", 1000),
        entry("Brainstorm", 400),
    ],
    "top_cards": [
        entry("Rhystic Study", 9000),
        entry("Smothering Tithe", 7000),
        entry("Ponder", 6000),
        entry("The One Ring", 3000),
    ],
    "creatures": [entry("Llanowar Elves", 2000)],
    "instants": [entry("Cyclonic Rift", 5000), entry("Swords to Plowshares", 4000)],
    "sorceries": [entry("Wrath of God", 1500)],
    "artifacts": [entry("Mind Stone", 2500)],
    "lands": [entry(*LAND_GC), entry("Reliquary Tower", 500)],
}
mtg.edhrec_lookup = lambda names: FAKE_EDHREC
COMMANDER = "Atraxa, Praetors' Voice"  # WUBG: every name above is on-colour


def skeleton(bracket):
    r = mtg.wizard_build_skeleton(COMMANDER, bracket=bracket)
    assert not r["error"], r
    return r["skeleton"]


def names(sk, pred):
    return sorted(
        {c["name"] for cards in sk.values() for c in cards if pred(c["name"])}
    )


baseline_plain = names(skeleton(5), lambda n: not is_gc(n))
assert set(PLAIN) <= set(baseline_plain)
for b in (None, 1, 2, 3, 4, 5):
    sk = skeleton(b)
    gcs = names(sk, is_gc)
    # Nothing collateral: every non-game-changer survives at every bracket.
    assert names(sk, lambda n: not is_gc(n)) == baseline_plain, b
    if b in (None, 1, 2):
        assert gcs == [], (b, gcs)
    elif b == 3:
        # Three most played: Rhystic 9000, Cradle 8000, Tithe 7000.
        assert gcs == sorted(["Rhystic Study", "Gaea's Cradle", "Smothering Tithe"]), (
            gcs
        )
        rhystic = [
            k for k, cards in sk.items() for c in cards if c["name"] == "Rhystic Study"
        ]
        assert sorted(rhystic) == ["high_synergy", "top_cards"], rhystic
    else:
        assert gcs == sorted([*GC_PLAYS, LAND_GC[0]]), (b, gcs)

# --- fills ------------------------------------------------------------------- #
# A near-empty blue deck is thin on draw, removal and wipes, and the most-played
# blue candidates include game changers (Rhystic Study, Cyclonic Rift, ...).
mtg.combo_search = lambda hd: {}
DECK = "Commander\n1 Talrand, Sky Summoner\nDeck\n1 Island\n"


def fill_names(bracket):
    r = mtg.ai_composition_fills(DECK, bracket=bracket)
    assert not r["error"] and r["fills"], r
    out = {}
    for f in r["fills"]:
        pool = [p["name"] for p in f["pool"]]
        sugg = [s["name"] for s in f["suggestions"]]
        assert set(sugg) <= set(pool), f
        out[f["category"]] = pool
    return out


open_fills = fill_names(4)
gc_at_4 = sorted({n for pool in open_fills.values() for n in pool if is_gc(n)})
# The fixture must be able to show the bug: game changers are really on offer.
assert gc_at_4, "no game changer among bracket-4 fills; fixture can't exhibit the bug"
assert fill_names(5) == open_fills
for b in (None, 1, 2, 3):
    fills = fill_names(b)
    leaked = sorted({n for pool in fills.values() for n in pool if is_gc(n)})
    assert leaked == [], (b, leaked)
    for cat, pool in fills.items():
        # The filter runs before the 12-card slice, so pools stay full.
        if len(open_fills[cat]) == 12:
            assert len(pool) == 12, (b, cat, len(pool))

print(f"test_game_changer_bracket: ok (bracket-4 fills offer {gc_at_4})")
