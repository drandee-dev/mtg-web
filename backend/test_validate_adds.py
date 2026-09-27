"""Self-check for the AI-named-card gate (validate_adds / deck_identity) and the
paths that route through it. Run: python test_validate_adds.py

Uses the real bulk card index on disk. Hermetic otherwise: _ai_call is faked
and combo_search stubbed, so no network and no cost.
"""

import json
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

mtg.combo_search = lambda hd: {}  # external service; not what's under test

EZURI = (
    "Commander\n1 Ezuri, Renegade Leader\nDeck\n"
    "1 Beast Whisperer\n1 Llanowar Elves\n1 Forest"
)
KOZILEK = "Commander\n1 Kozilek, the Great Distortion\nDeck\n1 Sol Ring\n1 Wastes"
MONO_G_NO_CMDR = "1 Llanowar Elves\n1 Beast Whisperer\n1 Forest"


def statuses(names, deck, fmt="commander"):
    out = mtg.validate_adds(names, deck, fmt)
    return out, {r["input"]: (r["status"], r["name"]) for r in out["results"]}


# --- exact lookup: no fuzzy / substring matching --------------------------- #
idx = mtg._bulk_index()
assert idx.get("Beast Whisperer's better friend, Skyshroud Claim") is None
assert idx.get("Sol Rin") is None

# --- mono-G Ezuri: the prod failure (2026-09-27) --------------------------- #
out, s = statuses(
    [
        "Blasphemous Act",
        "Winding Constrictor",
        "Beast Whisperer's better friend, Skyshroud Claim",
        "Beast Whisperer",
        "Mana Crypt",
        "Dockside Extortionist",
        "Fire",
        "Lightning Bolt",
        "lightning bolt",
        "Skyshroud Claim",
        "Forest",
    ],
    EZURI,
)
assert out["identity"] == ["G"] and out["identity_source"] == "commander", out
assert s["Blasphemous Act"][0] == "off_color", s
assert s["Winding Constrictor"][0] == "off_color", s
assert s["Beast Whisperer's better friend, Skyshroud Claim"] == ("unknown", None), s
assert s["Beast Whisperer"][0] == "in_deck", s
assert s["Mana Crypt"][0] == "illegal", s
assert s["Dockside Extortionist"][0] == "illegal", s
assert s["Fire"] == ("off_color", "Fire // Ice"), s
assert s["Lightning Bolt"] == ("off_color", "Lightning Bolt"), s
assert s["lightning bolt"] == ("off_color", "Lightning Bolt"), s
assert s["Skyshroud Claim"][0] == "ok", s
assert s["Forest"][0] == "ok", s  # basics never count as already in
print("ok: mono-G Ezuri statuses")

# --- identity without a commander ------------------------------------------ #
out, _ = statuses(["Sol Ring"], "1 Krenko, Mob Boss\n1 Goblin Guide\n1 Mountain")
assert (out["identity"], out["identity_source"]) == (["R"], "first_line"), out
GRUUL_NO_CMDR = (
    "1 Llanowar Elves\n1 Lightning Bolt\n1 Elvish Mystic\n1 Shock\n"
    "1 Forest\n1 Mountain\n1 Rampant Growth\n1 Goblin Guide"
)
out, s = statuses(["Lightning Bolt", "Swords to Plowshares"], GRUUL_NO_CMDR)
assert (out["identity"], out["identity_source"]) == (["R", "G"], "cards"), out
assert s["Lightning Bolt"][0] == "in_deck", s
assert s["Swords to Plowshares"][0] == "off_color", s
# A leaked off-color card (what the old bug put into decks) must not widen
# the inferred identity: one red card among green ones stays green-only.
out, s = statuses(["Lightning Bolt"], "1 Llanowar Elves\n1 Forest\n1 Blasphemous Act")
assert (out["identity"], out["identity_source"]) == (["G"], "cards"), out
assert s["Lightning Bolt"][0] == "off_color", s
out, _ = statuses(["Sol Ring"], "")
assert (out["identity"], out["identity_source"]) == (None, None), out
print("ok: first_line / cards / none identity sources")


# --- analyze offers the first line as commander, never applies it ---------- #
def candidate(text, fmt="commander"):
    return mtg.analyze_deck(text, fmt=fmt)["commander_candidate"]


a = mtg.analyze_deck("1 Krenko, Mob Boss\n1 Goblin Guide\n1 Mountain")
assert a["commander_candidate"] == "Krenko, Mob Boss" and a["commanders"] == [], a
# Front-face name as written, not the record's "A // B".
assert candidate("1 Esika, God of the Tree\n1 Forest") == "Esika, God of the Tree"
# Commander already set; the first card of the 99 is eligible but not offered.
assert (
    candidate("Commander\n1 Ezuri, Renegade Leader\nDeck\n1 Krenko, Mob Boss") is None
)
assert candidate(GRUUL_NO_CMDR) is None  # first line isn't commander-eligible
assert candidate("1 Krenko, Mob Boss\n1 Mountain", fmt="modern") is None
print("ok: analyze commander_candidate")

# --- colorless commander = colorless only, not "anything" ------------------ #
out, s = statuses(["Mind Stone", "Llanowar Elves", "Sol Ring"], KOZILEK)
assert (out["identity"], out["identity_source"]) == ([], "commander"), out
assert s["Mind Stone"][0] == "ok", s
assert s["Llanowar Elves"][0] == "off_color", s
assert s["Sol Ring"][0] == "in_deck", s
out, s = statuses(
    ["Sol Ring"], "Commander\n1 Kozilek, the Great Distortion\nDeck\n1 Wastes"
)
assert s["Sol Ring"][0] == "ok", s
print("ok: colorless commander")

# --- partners union ------------------------------------------------------- #
out, s = statuses(
    ["Lightning Bolt", "Swords to Plowshares"],
    "Commander\n1 Tymna the Weaver\n1 Thrasios, Triton Hero\nDeck\n1 Sol Ring",
)
assert out["identity"] == ["W", "U", "B", "G"], out
assert s["Lightning Bolt"][0] == "off_color", s
assert s["Swords to Plowshares"][0] == "ok", s
out, s = statuses(
    ["Thrasios, Triton Hero"],
    "Commander\n1 Tymna the Weaver\n1 Thrasios, Triton Hero\nDeck\n1 Sol Ring",
)
assert s["Thrasios, Triton Hero"][0] == "in_deck", s  # a commander is "in the deck"
print("ok: partner identity union")

# --- 60-card format: no identity, 4-copy rule, basics exempt --------------- #
# Modern, not Standard: Standard legality rotates and this runs on real,
# weekly-refreshed data.
out, s = statuses(
    ["Lightning Bolt", "Shock", "Llanowar Elves", "Mountain", "Mana Crypt"],
    "4 Lightning Bolt\n2 Shock\n20 Mountain",
    fmt="modern",
)
assert out["identity"] is None, out
assert s["Lightning Bolt"][0] == "in_deck", s
assert s["Shock"][0] == "ok", s
assert s["Llanowar Elves"][0] == "ok", s  # off-color is fine outside commander
assert s["Mountain"][0] == "ok", s
assert s["Mana Crypt"][0] == "illegal", s
print("ok: modern copy rule")

# --- "any number of cards named" exemption --------------------------------- #
_, s = statuses(["Relentless Rats", "Swamp"], "1 Relentless Rats\n1 Swamp")
assert s["Relentless Rats"][0] == "ok", s
assert s["Swamp"][0] == "ok", s
print("ok: Relentless Rats exempt")

# --- ai_optimize drops every add that isn't ok ----------------------------- #
_real_ai_call = mtg._ai_call


def optimize_adds(deck, adds):
    changes = [{"action": "add", "add": a, "impact": "high"} for a in adds]
    mtg._ai_call = lambda *a, **k: {
        "error": False,
        "result": json.dumps({"assessment": "x", "changes": changes}),
        "model": "fake",
    }
    try:
        out = mtg.ai_optimize(deck)
    finally:
        mtg._ai_call = _real_ai_call
    assert out["error"] is False, out
    return [c["add"] for c in out["changes"]]


assert optimize_adds(KOZILEK, ["Llanowar Elves", "Mana Crypt", "Mind Stone"]) == [
    "Mind Stone"
]
assert optimize_adds(
    MONO_G_NO_CMDR, ["Lightning Bolt", "Mana Crypt", "Elvish Mystic"]
) == ["Elvish Mystic"]
print("ok: ai_optimize keeps only valid adds")

# --- the identity rule reaches the shared prompt summary ------------------- #
summary = mtg._deck_context(EZURI)["summary"]
assert "Color identity: G. Every card you suggest" in summary, summary[:400]
summary = mtg._deck_context(MONO_G_NO_CMDR)["summary"]
assert "Color identity: G (inferred, no commander set)." in summary, summary[:400]
summary = mtg._deck_context(KOZILEK)["summary"]
assert "Color identity: colorless: only colorless cards." in summary, summary[:400]
assert "Color identity" not in mtg._deck_context("4 Shock", "modern")["summary"]
print("ok: identity line in the deck summary")

# --- fills: colorless commander searches colorless-only ("C") ------------- #
_seen: list = []
_real_search = mtg._search_cards
mtg._search_cards = lambda *a, **k: _seen.append(k.get("color_identity")) or []
mtg.deck_composition = lambda *a, **k: {
    "categories": [
        {"key": "ramp", "label": "Ramp", "status": "thin", "count": 1, "target": 10}
    ]
}
try:
    mtg.ai_composition_fills(KOZILEK)
    mtg.ai_composition_fills(EZURI)
    fills_seen, _seen[:] = list(_seen), []
    # budget_swaps is the sibling path: same rule, colorless = "C".
    mtg.budget_swaps(KOZILEK, threshold=0.01)
finally:
    mtg._search_cards = _real_search
assert fills_seen == ["C", "G"], fills_seen
assert _seen and set(_seen) == {"C"}, _seen
print("ok: fills and budget_swaps pass C for a colorless commander")

# --- endpoint validation --------------------------------------------------- #
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
url = "/api/deck/validate-cards"
r = client.post(url, json={"decklist": EZURI, "names": ["Sol Ring"]})
assert r.status_code == 200 and r.json()["results"][0]["status"] == "ok", r.text
assert client.post(url, json={"names": [f"c{i}" for i in range(41)]}).status_code == 422
assert client.post(url, json={"names": ["x" * 101]}).status_code == 422
assert client.post(url, json={"names": ["   "]}).status_code == 422
assert client.post(url, json={"names": []}).status_code == 422
assert (
    client.post(url, json={"names": ["Sol Ring"], "format": "nope"}).status_code == 422
)
assert (
    client.post(url, json={"names": ["Sol Ring"], "decklist": "x" * 50_001}).status_code
    == 422
)
print("ok: endpoint rejects bad bodies")

print("\nall validate_adds checks passed")
