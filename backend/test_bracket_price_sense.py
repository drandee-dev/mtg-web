"""Self-check: bracket and price sense (audit job 3.6).
Run: python test_bracket_price_sense.py

Fills and budget swaps share Optimize's bracket check (_lifts_past), and Optimize
holds back a swap whose new card is cheaper AND played in fewer of this commander's
EDHREC decks, unless his goals chose savings (his answer, 2026-11-25). Real bulk index;
EDHREC and Anthropic stubbed; no network, no cost.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

os.environ.pop("ANTHROPIC_API_KEY", None)
mtg.combo_search = lambda hd: {}
mtg.edhrec_lookup = lambda names, timeout=None: {}
PRECONS = Path(__file__).parent / "test_fixtures" / "precons"
idx = mtg._bulk_index()
SLIVERS = (PRECONS / "sliver-swarm.txt").read_text()


def fresh():
    mtg._ctx_cache.clear()
    mtg._cardlists_cache.clear()


# --- the shared check ------------------------------------------------------- #
fresh()
base = [r for r in mtg._deck_context(SLIVERS, "commander")["hd"].records if r]
now, _ = mtg._bracket_signals(base)
assert now == 2, now
gc = idx.get("Rhystic Study")
assert gc and gc.get("game_changer"), "Rhystic Study is no longer a Game Changer"
assert mtg._lifts_past(base, gc, None, 2)
assert not mtg._lifts_past(base, gc, None, 3)  # one Game Changer is bracket 3
assert not mtg._lifts_past(base, idx.get("Sol Ring"), None, 2)
print("ok: _lifts_past flags a Game Changer in a bracket 2 deck, not at 3")


# --- fills: no pool card lifts the deck, with no target bracket set ----------- #
def lifts(name, deck_recs, ceiling=2):
    return mtg._lifts_past(deck_recs, idx.get(name), None, ceiling)


checked = 0
for slug in (
    "sliver-swarm",
    "veloci-ramp-tor",
    "undead-unleashed",
    "silverquill-statement",
):
    fresh()
    text = (PRECONS / f"{slug}.txt").read_text()
    recs = [r for r in mtg._deck_context(text, "commander")["hd"].records if r]
    ceiling = mtg._bracket_signals(recs)[0]
    out = mtg.ai_composition_fills(text, fmt="commander")  # bracket=None: no target
    for f in out["fills"]:
        for p in f["pool"]:
            assert not lifts(p["name"], recs, ceiling), (slug, f["category"], p["name"])
            checked += 1
assert checked, "no fill pools at all: nothing was checked"
print(
    f"ok: {checked} fill candidates across the precons, none lifts its deck's bracket"
)

# --- budget swaps: no alternative lifts the deck ----------------------------- #
for slug in (
    "sliver-swarm",
    "veloci-ramp-tor",
    "undead-unleashed",
    "silverquill-statement",
):
    fresh()
    text = (PRECONS / f"{slug}.txt").read_text()
    recs = [r for r in mtg._deck_context(text, "commander")["hd"].records if r]
    ceiling = mtg._bracket_signals(recs)[0]
    for s in mtg.budget_swaps(text)["swaps"]:
        assert not mtg._lifts_past(
            recs, idx.get(s["alternative"]["name"]), idx.get(s["card"]), ceiling
        ), (slug, s)
print("ok: no budget swap alternative lifts its deck's bracket")

# The real pools above hold no bracket-lifting card, so they can't fail; these can.
# Armageddon ($2.53, mass land denial, not a Game Changer) lifts a bracket 2 deck, and
# fills' older rule only blocks Game Changers.
ARMA, DIVI = idx.get("Armageddon"), idx.get("Divination")
assert mtg._lifts_past(base, ARMA, None, 2) and not ARMA.get("game_changer")
real_fill = mtg._fill_candidates
mtg._fill_candidates = lambda cfg, **kw: [ARMA, DIVI]
QUILL = (PRECONS / "silverquill-statement.txt").read_text()
fresh()  # the Sliver deck has thin categories; Silverquill's has none
pools = [
    p["name"] for f in mtg.ai_composition_fills(SLIVERS)["fills"] for p in f["pool"]
]
assert "Divination" in pools and "Armageddon" not in pools, pools
fresh()
alts = {s["card"]: s["alternative"]["name"] for s in mtg.budget_swaps(QUILL)["swaps"]}
# Dearest first: Tempting Contract ($9.61) picks before Incarnation Technique, and
# Armageddon is first in the stubbed list, so without the check it would win.
assert alts.get("Tempting Contract") == "Divination", alts
assert "Armageddon" not in alts.values(), alts
mtg._fill_candidates = real_fill
print(
    "ok: fills and budget swaps skip a cheap mass land denial card in a bracket 2 deck"
)


# --- Optimize: weaker-for-cheaper is held back unless savings is the goal ---- #
def page(cut_share, add_share):
    def cv(name, share):
        return {
            "name": name,
            "synergy": 0.1,
            "lift": 1.0,
            "num_decks": round(share * 2000),
            "potential_decks": 2000,
        }

    return {
        "creatures": [cv("Sliver Hivelord", cut_share), cv("Ward Sliver", add_share)]
    }


SWAP = {
    "action": "swap",
    "cut": "Sliver Hivelord",
    "add": "Ward Sliver",
    "reason": "r",
    "category": "Protection",
    "impact": "medium",
}
mtg._ai_call = lambda *a, **k: {
    "error": False,
    "result": json.dumps({"assessment": "", "changes": [SWAP]}),
}
hive, ward = (
    mtg.extract_price(idx.get("Sliver Hivelord")),
    mtg.extract_price(idx.get("Ward Sliver")),
)
assert hive and ward and ward < hive, (hive, ward)


def optimize(cut_share, add_share, goals=None):
    fresh()
    mtg.edhrec_lookup = lambda names, timeout=None: page(cut_share, add_share)
    return mtg.ai_optimize(SLIVERS, goals=goals, api_key="t")


out = optimize(0.30, 0.05)
assert not out["changes"] and out["held_back"][0]["reason"] == "weaker", out
assert "cheaper card this commander's decks play less" in out["held_back_note"], out
out = optimize(0.05, 0.30)  # cheaper and played MORE: an upgrade, kept
assert [c["add"] for c in out["changes"]] == ["Ward Sliver"], out
out = optimize(0.30, 0.05, goals={"over_budget": "savings", "budget_ceiling": 50})
assert [c["add"] for c in out["changes"]] == ["Ward Sliver"], out
print("ok: a cheaper, less played swap is held back, unless savings is the goal")
