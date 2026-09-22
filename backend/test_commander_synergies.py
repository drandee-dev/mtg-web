"""Self-check for commander_synergies. Run: python test_commander_synergies.py

Hermetic: stubs the EDHREC call and the bulk index, so it needs no network and no
Scryfall download. Covers the two things that actually broke while building it.
"""
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

# One real EDHREC row, verbatim, including the inclusion:0 that makes the obvious
# reading of this payload wrong.
PAYLOAD = {
    "high_synergy": [
        {
            "name": "Tekuthal, Inquiry Dominus",
            "synergy": 0.2732335280024992,
            "inclusion": 0,
            "num_decks": 29907,
            "potential_decks": 44850,
        },
        {
            "name": "Not In The Index",
            "synergy": 0.5,
            "inclusion": 0,
            "num_decks": 100,
            "potential_decks": 200,
        },
        {
            "name": "No Potential Decks",
            "synergy": 0.1,
            "inclusion": 0,
            "num_decks": 5,
            "potential_decks": 0,
        },
    ]
}


def setup(lookup):
    mtg._synergy_cache.clear()
    mtg.edhrec_lookup = lookup
    mtg._bulk_index = lambda: {
        "Tekuthal, Inquiry Dominus": {"name": "Tekuthal, Inquiry Dominus"},
        "No Potential Decks": {"name": "No Potential Decks"},
    }


def test_derived_numbers():
    setup(lambda names: PAYLOAD)
    out = mtg.commander_synergies("Atraxa, Praetors' Voice")

    card = out[0]
    # 29907/44850 = 66.7%. Reading the inclusion field instead yields 0 — that is the
    # bug this line exists to catch.
    assert card["pct"] == 67, card
    assert card["synergy"] == 27, card
    assert card["name"] == "Tekuthal, Inquiry Dominus"

    names = [c["name"] for c in out]
    assert "Not In The Index" not in names, "cards absent from the bulk index must drop"
    assert dict(zip(names, out))["No Potential Decks"]["pct"] is None, "no divide by zero"
    print("ok: derived numbers, index filter, zero-division guard")


def test_third_party_failure_degrades():
    """EDHREC answers 403 for commanders it has no page for (meld back-faces)."""

    def boom(names):
        raise RuntimeError("403 Client Error: Forbidden")

    setup(boom)
    assert mtg.commander_synergies("Brisela, Voice of Nightmares") == []
    print("ok: a third-party failure degrades to an empty section")


def test_failures_expire_sooner_than_hits():
    calls = []

    def boom(names):
        calls.append(names)
        raise RuntimeError("403")

    setup(boom)
    mtg.commander_synergies("Brisela, Voice of Nightmares")
    assert len(calls) == 1
    mtg.commander_synergies("Brisela, Voice of Nightmares")
    assert len(calls) == 1, "a cached miss must not re-hit EDHREC"

    # A miss caches for minutes, a hit for hours. If both used one TTL, a transient
    # block would stick for half a day.
    expiry = mtg._synergy_cache["brisela, voice of nightmares"][0]
    setup(lambda names: PAYLOAD)
    mtg.commander_synergies("Atraxa, Praetors' Voice")
    hit_expiry = mtg._synergy_cache["atraxa, praetors' voice"][0]
    assert hit_expiry - expiry > 3600, (hit_expiry, expiry)
    print("ok: misses expire sooner than hits")


if __name__ == "__main__":
    _real_lookup, _real_index = mtg.edhrec_lookup, mtg._bulk_index
    try:
        test_derived_numbers()
        test_third_party_failure_degrades()
        test_failures_expire_sooner_than_hits()
        print("\nall passed")
    finally:
        mtg.edhrec_lookup, mtg._bulk_index = _real_lookup, _real_index
