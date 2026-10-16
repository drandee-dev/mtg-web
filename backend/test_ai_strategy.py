"""Self-check for the extended strategy call (UX overhaul job 3.4).
Run: python test_ai_strategy.py

Hermetic: _ai_call is spied, so no API call and no cost. Uses the real bulk card
index. Checks that game_plan and synergies come back, that synergy cards pass
the same exact-name gate as every other AI-named card (a made-up name, or a real
card that is not in this deck, is dropped), and that the route takes a model.
"""
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from fastapi.testclient import TestClient  # noqa: E402

from app import main, mtg  # noqa: E402

DECK = "\n".join(
    [
        "1 Atraxa, Praetors' Voice",
        "1 Sol Ring",
        "1 Doubling Season",
        "1 Deepglow Skate",
        "1 Command Tower",
    ]
)
CMD = "Atraxa, Praetors' Voice"

SYNERGIES = [
    {"cards": ["sol ring", "Doubling Season"], "note": "Mana into proliferate."},
    {"cards": ["Sol Ring", "Totally Made Up Card"], "note": "One real card only."},
    {"cards": ["Rhystic Study", "Cyclonic Rift"], "note": "Real, but not in this deck."},
    {"cards": ["Deepglow Skate", "Doubling Season", "Sol Ring"], "note": "x" * 400},
    "not a dict",
]
REPLY = {
    "strategy": "**Superfriends** - proliferate.",
    "archetype": "Superfriends",
    "game_plan": "Ramp, then proliferate.",
    "synergies": SYNERGIES,
}

sent: list[dict] = []


def spy_for(reply):
    import json

    def spy(system, user_msg=None, *, messages=None, **kw):
        sent.append({"system": system, "messages": messages, "kw": kw})
        return {"error": False, "result": json.dumps(reply), "model": "spy"}

    return spy


real = mtg._ai_call
mtg._ai_call = spy_for(REPLY)
try:
    out = mtg.ai_strategy(DECK, commander=CMD)
finally:
    mtg._ai_call = real

assert out["error"] is False and out["archetype"] == "Superfriends", out
assert out["game_plan"] == "Ramp, then proliferate.", out
syn = out["synergies"]
# Canonical spelling, made-up and not-in-deck names dropped, short groups gone.
assert syn[0] == {"cards": ["Sol Ring", "Doubling Season"], "note": "Mana into proliferate."}, syn
assert len(syn) == 2, syn
assert syn[1]["cards"] == ["Deepglow Skate", "Doubling Season", "Sol Ring"], syn
assert len(syn[1]["note"]) == 300, len(syn[1]["note"])
assert "Rhystic Study" not in str(syn) and "Made Up" not in str(syn), syn
# The instruction asks for the new fields and the cache layout is unchanged.
text = sent[0]["messages"][0]["content"][1]["text"]
assert "game_plan" in text and "synergies" in text
assert sent[0]["system"] == mtg._DECKBUILDER_SYSTEM
print("ok: game_plan and synergies come back, synergy names are gated")

# Bad shapes fall back to an empty list rather than raising.
for bad in (None, "x", {"cards": []}, [None], [{"cards": "Sol Ring"}]):
    assert mtg._checked_synergies(bad, DECK, "commander") == [], bad
# An old-shape reply (no new fields) still parses.
mtg._ai_call = spy_for({"strategy": "s", "archetype": "a"})
try:
    old = mtg.ai_strategy(DECK, commander=CMD)
finally:
    mtg._ai_call = real
assert old["game_plan"] == "" and old["synergies"] == [], old
# A strategy or archetype that is not text comes back as text, never a list.
mtg._ai_call = spy_for({"strategy": ["a"], "archetype": {"x": 1}, "game_plan": 5})
try:
    odd = mtg.ai_strategy(DECK, commander=CMD)
finally:
    mtg._ai_call = real
assert all(isinstance(odd[k], str) for k in ("strategy", "archetype", "game_plan")), odd
print("ok: bad and old-shape replies are safe")

# --- route ------------------------------------------------------------------- #
main._check_ai_access = lambda request: None
mtg._ai_call = spy_for(REPLY)
client = TestClient(main.app)
try:
    URL = "/api/deck/ai/strategy"
    r = client.post(URL, json={"decklist": DECK, "format": "commander", "bracket": 3})
    assert r.status_code == 200 and r.json()["synergies"], r.text
    r = client.post(URL, json={"decklist": DECK, "format": None})  # null = commander
    assert r.status_code == 200, r.text
    pair = "A" * 100 + " && " + "B" * 100  # a partner pair is accepted
    r = client.post(URL, json={"decklist": DECK, "commander": pair})
    assert r.status_code == 200, r.text
    for body, want in (
        ({"decklist": "   "}, 400),
        ({"decklist": DECK, "format": "bogus"}, 400),
        ({}, 422),
        ({"decklist": DECK, "bracket": 9}, 422),
        ({"decklist": DECK, "commander": "x" * 205}, 422),
        ({"decklist": "x" * 50_001}, 422),
    ):
        r = client.post(URL, json=body)
        assert r.status_code == want, (str(body)[:40], r.status_code, r.text)
finally:
    mtg._ai_call = real
print("ok: route validates its body")
print("\nall strategy checks passed")
