"""Self-check for the AI pass's two picks per change (suggestions job 4).
Run: python test_optimize_two_picks.py

Each swap or add names the strongest card and a cheaper one doing the same job.
The server keeps the cheaper card only when it passes the add gate, is a
different card, costs less (both priced), shares a role with the strongest
pick and is no other change's main add; both picks say whether they leave the
deck over the Goals budget.

Uses the real bulk card index on disk. Hermetic otherwise: _ai_call is faked
and the external lookups stubbed, so no network and no cost.
"""

import json
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

mtg.combo_search = lambda hd: {}  # external service; not what's under test
mtg.edhrec_lookup = lambda names, timeout=None: {}  # likewise

DECK = (
    "Commander\n1 Atraxa, Praetors' Voice\nDeck\n"
    "1 Commander's Sphere\n1 Cultivate\n1 Mind Stone\n1 Forest\n1 Island"
)
idx = mtg._bulk_index()
price = lambda n: mtg.extract_price(idx.get(n))  # noqa: E731
# The cases below lean on these real prices and roles; say so if the data moves.
assert price("Arcane Signet") < price("Smothering Tithe"), "Signet no longer cheaper"
assert price("Swords to Plowshares") < price("Rhystic Study"), "Swords no longer cheaper"
for n in ("Smothering Tithe", "Arcane Signet", "Fellwar Stone"):
    assert "Ramp" in mtg._classify_roles(idx.get(n)), (n, mtg._classify_roles(idx.get(n)))
assert not set(mtg._classify_roles(idx.get("Rhystic Study"))) & set(
    mtg._classify_roles(idx.get("Swords to Plowshares"))
), "Rhystic Study and Swords now share a role; pick another pair"

_real_ai_call = mtg._ai_call
calls: list[dict] = []


def run(changes, goals=None):
    def fake(system, **k):
        calls.append({"system": system, **k})
        return {
            "error": False,
            "result": json.dumps({"assessment": "x", "changes": changes}),
            "model": "fake",
        }

    mtg._ai_call = fake
    mtg._ctx_cache.clear()
    try:
        out = mtg.ai_optimize(DECK, goals=goals)
    finally:
        mtg._ai_call = _real_ai_call
    assert out["error"] is False, out
    return {(c["cut"], c["add"]): c for c in out["changes"]}


def swap(cut, add, cheaper=None, action="swap"):
    ch = {"action": action, "cut": cut, "add": add, "reason": "r",
          "category": "Ramp", "impact": "high"}
    if cheaper:
        ch |= {"cheaper": cheaper, "cheaper_reason": "same ramp, less money"}
    return ch


# --- which cheaper picks survive ------------------------------------------ #
def cheaper_of(change):
    """The cheaper pick the server keeps for one change run on its own."""
    (only,) = run([change]).values()
    return only["cheaper"]


kept = cheaper_of(swap("Commander's Sphere", "Smothering Tithe", "Arcane Signet"))
assert kept and kept["name"] == "Arcane Signet", kept
assert kept["price_usd"] == round(price("Arcane Signet"), 2), kept
assert kept["price_delta"] == round(price("Arcane Signet") - price("Commander's Sphere"), 2), kept
assert kept["reason"] == "same ramp, less money" and kept["over_budget"] is False, kept
# Arcane Signet is the main add of the Cultivate change, so it is no option for the
# Sphere one either.
out = run([
    swap("Commander's Sphere", "Smothering Tithe", "Arcane Signet"),
    swap("Cultivate", "Arcane Signet"),
])
assert out[("Commander's Sphere", "Smothering Tithe")]["cheaper"] is None, out
for label, change in (
    ("dearer", swap("Cultivate", "Arcane Signet", "Smothering Tithe")),
    ("other job", swap("Mind Stone", "Rhystic Study", "Swords to Plowshares")),
    ("off colour", swap(None, "Fellwar Stone", "Lightning Bolt", action="add")),
    ("same card", swap("Commander's Sphere", "Smothering Tithe", "Smothering Tithe")),
    ("unknown card", swap("Commander's Sphere", "Smothering Tithe", "Not A Real Card")),
):
    assert cheaper_of(change) is None, label
# An add gets a cheaper pick too; a bare cut never does.
out = run([
    swap(None, "Smothering Tithe", "Arcane Signet", action="add"),
    {"action": "cut", "cut": "Cultivate", "reason": "r", "category": "Ramp",
     "impact": "low", "cheaper": "Arcane Signet"},
])
assert out[(None, "Smothering Tithe")]["cheaper"]["name"] == "Arcane Signet", out
assert out[("Cultivate", None)]["cheaper"] is None, out
print("ok: cheaper picks kept only when real, cheaper, same job and unique")

# --- the budget marks both picks ------------------------------------------ #
deck_price = mtg.deck_breakdown(mtg._deck_context(DECK)["hd"])["price_usd"]
tithe_delta = price("Smothering Tithe") - price("Commander's Sphere")
signet_delta = price("Arcane Signet") - price("Commander's Sphere")
assert tithe_delta > signet_delta + 1, "need a clear gap between the two picks"
# A cap between the two: the strongest breaks it, the cheaper one fits.
cap = deck_price + (tithe_delta + signet_delta) / 2
for goals, strong_over, cheap_over in (
    (None, False, False),
    ({"budget_ceiling": cap}, True, False),
    ({"budget_ceiling": deck_price - 5}, True, True),  # already over: both marked
    ({"budget_ceiling": deck_price + 1000}, False, False),
):
    c = run([swap("Commander's Sphere", "Smothering Tithe", "Arcane Signet")], goals)[
        ("Commander's Sphere", "Smothering Tithe")
    ]
    assert c["over_budget"] is strong_over, (goals, c)
    assert c["cheaper"]["over_budget"] is cheap_over, (goals, c)
print("ok: over_budget on both picks against the deck's own price")

# --- what the AI is told --------------------------------------------------- #
calls.clear()
run([swap("Commander's Sphere", "Smothering Tithe", "Arcane Signet")], {"budget_ceiling": 300})
call = calls[-1]
assert call["max_tokens"] == 3500, call["max_tokens"]
assert call["schema"]["properties"]["changes"]["items"]["properties"]["cheaper"], call["schema"]
prompt = json.dumps(call["messages"])
assert "TWO PICKS" in prompt and "It binds the" in prompt, prompt[:2000]
assert "Never suggest additions that would push" not in prompt, "old budget line still sent"
assert f"Current deck price: ${deck_price:.0f}." in prompt, prompt[-600:]
# Every other caller keeps the old, binding budget line.
assert "Never suggest additions" in mtg.goals_prompt_parts({"budget_ceiling": 300})[0]
print("ok: prompt names both picks, the cheaper-only budget line and the deck price")
