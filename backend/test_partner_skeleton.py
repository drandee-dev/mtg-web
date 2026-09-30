"""Self-check: the wizard skeleton and narration build for a partner pair.
Run: python test_partner_skeleton.py

F2 (audit #8). The generator sends the app's commander string, "A && B" for a
pair. Before this the skeleton looked the whole string up as one name (or the
UI sent only the first partner), so a pair built from half its identity.
No network: EDHREC and the model call are stubbed.
"""

import os
import socket
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from fastapi.testclient import TestClient  # noqa: E402

from app import mtg  # noqa: E402
from app.main import app  # noqa: E402


def _no_network(*a, **k):
    raise AssertionError("network call in an offline test")


_real_socket = socket.socket
socket.socket = _no_network  # type: ignore[assignment,misc]
os.environ.pop("ANTHROPIC_API_KEY", None)
idx = mtg._bulk_index()

THRASIOS, TYMNA = "Thrasios, Triton Hero", "Tymna the Weaver"  # UG + WB
PAIR = f"{THRASIOS} && {TYMNA}"
GCS = ["Rhystic Study", "Smothering Tithe", "Demonic Tutor"]  # all WUBG-legal
asked = []


def fake_edhrec(names):
    asked.append(list(names))
    return {
        "top_cards": [
            {"name": n, "num_decks": 9000 - i, "synergy": 0.1}
            for i, n in enumerate(GCS)
        ]
    }


mtg.edhrec_lookup = fake_edhrec


def skeleton(cmd, bracket=None):
    r = mtg.wizard_build_skeleton(cmd, bracket=bracket)
    assert not r["error"], r
    return r


def names(r, key):
    return [c["name"] for c in r["skeleton"].get(key, [])]


# --- identity, EDHREC page, staples ------------------------------------------ #
r = skeleton(PAIR)
assert asked[-1] == [THRASIOS, TYMNA], asked  # the pair page, not Thrasios alone
assert r["commander"]["color_identity"] == ["W", "U", "B", "G"], r["commander"]
assert r["commander"]["name"] == f"{THRASIOS} + {TYMNA}"
lands = names(r, "suggested_lands")
assert {"Plains", "Island", "Swamp", "Forest"} <= set(lands), lands
assert "Mountain" not in lands
staples = names(r, "staples")
# One colour staple from each half: W and B are Tymna's, G is Thrasios's.
assert {"Swords to Plowshares", "Night's Whisper", "Cultivate"} <= set(staples)

# Solo still works, and still reads only its own identity.
solo = skeleton(THRASIOS)
assert solo["commander"]["color_identity"] == ["U", "G"]
assert "Plains" not in names(solo, "suggested_lands")

bad = mtg.wizard_build_skeleton(f"{THRASIOS} && Not A Card")
assert bad["error"] and "Not A Card" in bad["message"], bad

# --- game changers: each commander spends one of bracket 3's three ----------- #
# No partner commander is a game changer in bulk today, so flag them here.
assert not any(idx.get(n).get("game_changer") for n in (THRASIOS, TYMNA))


def gcs_kept(flags):
    for n, on in zip((THRASIOS, TYMNA), flags):
        idx.get(n)["game_changer"] = on
    try:
        r = skeleton(PAIR, bracket=3)
    finally:
        for n in (THRASIOS, TYMNA):
            idx.get(n)["game_changer"] = False
    return [n for n in names(r, "top_cards") if n in GCS]


assert gcs_kept((False, False)) == GCS
assert gcs_kept((True, False)) == GCS[:2]
assert gcs_kept((True, True)) == GCS[:1]

# --- narration sees both commanders ------------------------------------------ #
sent = []
mtg._ai_call = lambda system, user, **k: (
    sent.append(user) or {"error": False, "result": "ok", "model": "stub"}
)
mtg.wizard_narrate(PAIR, "Ramp", ["Sol Ring"], "")
msg = sent[-1]
assert f"Commander: {THRASIOS}" in msg and f"Commander: {TYMNA}" in msg, msg
assert "Scry 1" in msg and "postcombat main phase" in msg, msg  # both oracles

# --- endpoint: one or two names, each capped --------------------------------- #
# TestClient's event loop needs a local socketpair on Windows; EDHREC stays stubbed.
socket.socket = _real_socket  # type: ignore[misc]
client = TestClient(app)
ok = client.post("/api/deck/wizard/skeleton", json={"commander": PAIR})
assert ok.status_code == 200 and ok.json()["commander"]["color_identity"] == [
    "W", "U", "B", "G",
], ok.text
for bad_cmd in ("", "   ", f"{PAIR} && Kraum, Ludevic's Opus", f"{THRASIOS} && ",
                "x" * 101, 42, None):
    resp = client.post("/api/deck/wizard/skeleton", json={"commander": bad_cmd})
    assert resp.status_code == 400, (bad_cmd, resp.status_code)

print("test_partner_skeleton: ok")
