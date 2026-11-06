"""Self-check for the AI pass's two picks per change (suggestions job 4).
Run: python test_optimize_two_picks.py

Each swap or add names the strongest card and a cheaper one doing the same job.
The server keeps the cheaper card only when it passes the add gate, is a
different card, costs less (both priced), does the same job (a real role in
common, within 2 mana, the same kind of card, a land keeping the colours;
Andres's choice of 2026-11-06) and appears nowhere else in the list; both picks
say whether they leave the deck over the Goals budget.

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
    "1 Commander's Sphere\n1 Cultivate\n1 Thought Vessel\n1 Forest\n1 Island"
)
idx = mtg._bulk_index()
price = lambda n: mtg.extract_price(idx.get(n))  # noqa: E731

_real_ai_call = mtg._ai_call
calls: list[dict] = []


def run(changes, goals=None, *, deck=DECK, bracket=5, as_text=False, fmt="commander"):
    """bracket=5 by default: these checks add Game Changers (Rhystic Study, Demonic
    Tutor) to a deck with none, which job 4d's bracket cap would otherwise drop."""

    def fake(system, **k):
        calls.append({"system": system, **k})
        listed = changes
        if as_text == "wrapped":  # the whole answer nested once more (Holiday, 2026-11-06)
            listed = json.dumps({"assessment": "x", "changes": changes})
        elif as_text:
            listed = json.dumps(changes)
        return {
            "error": False,
            "result": json.dumps({"assessment": "x", "changes": listed}),
            "model": "fake",
        }

    mtg._ai_call = fake
    mtg._ctx_cache.clear()
    try:
        out = mtg.ai_optimize(deck, fmt=fmt, goals=goals, bracket=bracket)
    finally:
        mtg._ai_call = _real_ai_call
    assert out["error"] is False, out
    return {(c["cut"], c["add"]): c for c in out["changes"]}


def swap(cut, add, cheaper=None, action="swap"):
    ch = {"action": action, "cut": cut, "add": add, "reason": "r",
          "category": "Ramp", "impact": "high"}
    if cheaper:
        ch |= {"cheaper": cheaper, "cheaper_reason": "same job, less money"}
    return ch


def cheaper_of(change):
    """The cheaper pick the server keeps for one change run on its own."""
    (only,) = run([change]).values()
    return only["cheaper"]


# --- the same-job rule, on real cards ------------------------------------- #
# Each pair must really be cheaper, or it would drop for the wrong reason.
KEPT = [
    ("Rhystic Study", "Mystic Remora"),  # Draw, enchantments, 3 vs 1
    ("Chromatic Lantern", "Arcane Signet"),  # Ramp, artifacts, 3 vs 1
    ("Demonic Tutor", "Diabolic Intent"),  # Tutor, sorceries
    ("Overgrown Tomb", "Llanowar Wastes"),  # still taps B and G
]
DROPPED = [
    ("Vanquisher's Banner", "Mind Stone", "5 mana vs 2 (the real call kept this)"),
    ("Rhystic Study", "Mind Stone", "enchantment vs artifact"),
    ("Smothering Tithe", "Arcane Signet", "enchantment vs artifact: his rule drops it"),
    ("Craterhoof Behemoth", "Grizzly Bears", "8 mana vs 2"),
    ("Tarmogoyf", "Grizzly Bears", "'Creature' is no shared job, even at the same cost"),
    ("Coat of Arms", "Sol Ring", "the strongest has no role to share"),
    ("Overgrown Tomb", "Reliquary Tower", "stops tapping B and G"),
    ("Rhystic Study", "Swords to Plowshares", "no role in common"),
]
for strong, cheap, *_ in KEPT + DROPPED:
    assert price(cheap) < price(strong), f"{cheap} no longer cheaper than {strong}"
for strong, cheap in KEPT:
    got = cheaper_of(swap(None, strong, cheap, action="add"))
    assert got and got["name"] == cheap, (strong, cheap, got)
for strong, cheap, why in DROPPED:
    assert cheaper_of(swap(None, strong, cheap, action="add")) is None, why
print("ok: same job means a real shared role, within 2 mana, same kind, land colours kept")

# --- what a kept pick carries, and the other rejections ------------------- #
kept = cheaper_of(swap("Thought Vessel", "Rhystic Study", "Mystic Remora"))
assert kept["price_usd"] == round(price("Mystic Remora"), 2), kept
assert kept["price_delta"] == round(price("Mystic Remora") - price("Thought Vessel"), 2), kept
assert kept["reason"] == "same job, less money" and kept["over_budget"] is False, kept
for label, change in (
    ("dearer", swap("Commander's Sphere", "Arcane Signet", "Chromatic Lantern")),
    ("off colour", swap(None, "Fellwar Stone", "Lightning Bolt", action="add")),
    ("same card", swap("Thought Vessel", "Rhystic Study", "Rhystic Study")),
    ("unknown card", swap("Thought Vessel", "Rhystic Study", "Not A Real Card")),
):
    assert cheaper_of(change) is None, label
# A bare cut never gets one (on a deck over its size, where a bare cut is kept).
OVER = DECK + "\n95 Wastes"
out = run([{"action": "cut", "cut": "Cultivate", "reason": "r", "category": "Ramp",
            "impact": "low", "cheaper": "Arcane Signet"}], deck=OVER)
assert out[("Cultivate", None)]["cheaper"] is None, out
print("ok: kept pick carries price, change and reason; dearer, off colour, same and unknown dropped")

# --- a card appears once in the list -------------------------------------- #
# Another change's main add is no cheaper option.
out = run([
    swap("Commander's Sphere", "Chromatic Lantern", "Arcane Signet"),
    swap("Cultivate", "Arcane Signet"),
])
assert out[("Commander's Sphere", "Chromatic Lantern")]["cheaper"] is None, out
# Two changes offering the same cheaper card: the first keeps it. Applying both
# would otherwise leave the second as a cut with nothing added (Holiday, 2026-11-06).
second = swap("Cultivate", "Fellwar Stone", "Arcane Signet")
assert cheaper_of(second)["name"] == "Arcane Signet", "on its own it keeps Signet"
out = run([swap("Commander's Sphere", "Chromatic Lantern", "Arcane Signet"), second])
assert out[("Commander's Sphere", "Chromatic Lantern")]["cheaper"]["name"] == "Arcane Signet", out
assert out[("Cultivate", "Fellwar Stone")]["cheaper"] is None, out
print("ok: no card is offered twice")

# --- the budget marks both picks ------------------------------------------ #
deck_price = mtg.deck_breakdown(mtg._deck_context(DECK)["hd"])["price_usd"]
strong_delta = price("Rhystic Study") - price("Thought Vessel")
cheap_delta = price("Mystic Remora") - price("Thought Vessel")
assert strong_delta > cheap_delta + 1, "need a clear gap between the two picks"
# A cap between the two: the strongest breaks it, the cheaper one fits.
cap = deck_price + (strong_delta + cheap_delta) / 2
for goals, strong_over, cheap_over in (
    (None, False, False),
    ({"budget_ceiling": cap}, True, False),
    ({"budget_ceiling": deck_price - 5}, True, True),  # already over: both marked
    ({"budget_ceiling": deck_price + 1000}, False, False),
):
    c = run([swap("Thought Vessel", "Rhystic Study", "Mystic Remora")], goals)[
        ("Thought Vessel", "Rhystic Study")
    ]
    assert c["over_budget"] is strong_over, (goals, c)
    assert c["cheaper"]["over_budget"] is cheap_over, (goals, c)
print("ok: over_budget on both picks against the deck's own price")

# --- what the AI is told --------------------------------------------------- #
calls.clear()
run([swap("Thought Vessel", "Rhystic Study", "Mystic Remora")], {"budget_ceiling": 300})
call = calls[-1]
assert call["max_tokens"] == 3500, call["max_tokens"]
assert call["schema"]["properties"]["changes"]["items"]["properties"]["cheaper"], call["schema"]
prompt = json.dumps(call["messages"])
assert "TWO PICKS" in prompt and "within the target bracket" in prompt, prompt[:2000]
assert "It binds the" in prompt and "must not raise the" in prompt, prompt[:3000]
assert "Never suggest additions that would push" not in prompt, "old budget line still sent"
assert f"Current deck price: ${deck_price:.0f}." in prompt, prompt[-600:]
# Every other caller keeps the old, binding budget line.
assert "Never suggest additions" in mtg.goals_prompt_parts({"budget_ceiling": 300})[0]
print("ok: prompt names both picks, the cheaper-only budget line and the deck price")

# --- the Goals toggle: what the main pick leads with over the cap (job 4b) ---- #
# Andres, 2026-11-06: the strongest card, even on a deck already over its budget,
# unless the user chooses savings first.
two = lambda g: mtg.goals_prompt_parts(g, two_picks=True)[0]  # noqa: E731
STRONGEST = "including when the deck is already over the ceiling"
SAVINGS = "the user chose savings first"
assert STRONGEST in prompt and SAVINGS not in prompt, "default must be strongest first"
assert SAVINGS in two({"budget_ceiling": 300, "over_budget": "savings"})
assert STRONGEST not in two({"budget_ceiling": 300, "over_budget": "savings"})
assert STRONGEST in two({"budget_ceiling": 300, "over_budget": "strongest"})
# Job 4c: a paid call on an over-cap deck still chose cards to change to save money, so
# strongest first also says the ceiling is no reason to change a card; savings first doesn't.
NOT_A_GOAL = "never swap a card for a weaker one to save money"
assert NOT_A_GOAL in prompt and NOT_A_GOAL in two({"budget_ceiling": 300})
assert NOT_A_GOAL not in two({"budget_ceiling": 300, "over_budget": "savings"})
# The setting only shapes the budget line, so with no budget nothing is sent.
assert two({"over_budget": "savings"}) == ""
# The other callers' binding line is untouched by it.
assert SAVINGS not in mtg.goals_prompt_parts({"budget_ceiling": 300, "over_budget": "savings"})[0]

from app.main import GoalsPayload  # noqa: E402

assert GoalsPayload().over_budget == "strongest"
assert GoalsPayload(over_budget="Savings").over_budget == "savings"
try:
    GoalsPayload(over_budget="cheapest")
    raise AssertionError("an unknown over_budget value was accepted")
except ValueError:
    pass
print("ok: over budget leads with the strongest card unless the user picks savings first")

# --- job 4d: the list sent as text (2026-11-06, 1 of 6 paid calls) ------------ #
out = run([swap("Thought Vessel", "Mind Stone")], as_text=True)
assert ("Thought Vessel", "Mind Stone") in out, out
out = run([swap("Thought Vessel", "Mind Stone")], as_text="wrapped")
assert ("Thought Vessel", "Mind Stone") in out, out
print("ok: a change list sent as JSON text is read, not shown as an empty list")

# --- job 4d: bare adds and cuts keep the deck at its size --------------------- #
def size_of(deck):
    return mtg._deck_context(deck)["deck"]["total_cards"]


FULL, SHORT = DECK + "\n94 Wastes", DECK + "\n93 Wastes"
assert (size_of(DECK), size_of(SHORT), size_of(FULL), size_of(OVER)) == (6, 99, 100, 101)
bare_add = lambda n: swap(None, n, action="add")  # noqa: E731
bare_cut = lambda n: {"action": "cut", "cut": n, "reason": "r", "category": "Ramp", "impact": "low"}  # noqa: E731
# A full deck: neither, but a swap still goes through.
out = run([bare_add("Mind Stone"), bare_cut("Cultivate"), swap("Thought Vessel", "Fellwar Stone")], deck=FULL)
assert list(out) == [("Thought Vessel", "Fellwar Stone")], out
# One short: the first bare add fills it, a second would overfill; a cut would widen it.
out = run([bare_add("Mind Stone"), bare_add("Fellwar Stone"), bare_cut("Cultivate")], deck=SHORT)
assert list(out) == [(None, "Mind Stone")], out
# One over: one bare cut, not two; an add would widen it.
out = run([bare_cut("Cultivate"), bare_cut("Thought Vessel"), bare_add("Mind Stone")], deck=OVER)
assert list(out) == [("Cultivate", None)], out
# A dropped add uses no room: the bad name first, then the real card still fits.
out = run([bare_add("Not A Real Card"), bare_add("Mind Stone")], deck=SHORT)
assert list(out) == [(None, "Mind Stone")], out
print("ok: bare adds only while short of the deck's size, bare cuts only while over")

# --- job 4d: no Game Changer past the bracket ceiling (Andres, 2026-11-06) ----- #
# With no target the ceiling is the bracket the deck is in now; a target replaces it.
assert mtg._deck_context(DECK)["bracket"]["bracket"] == 2, "test deck must start in bracket 2"
GC = ["Rhystic Study", "Demonic Tutor", "Smothering Tithe", "Vampiric Tutor", "Cyclonic Rift"]
assert all(idx.get(n)["game_changer"] for n in GC) and not idx.get("Mind Stone")["game_changer"]
out = run([swap("Thought Vessel", "Rhystic Study"), swap("Cultivate", "Mind Stone")], bracket=None)
assert list(out) == [("Cultivate", "Mind Stone")], out
# The Goals target counts as the ceiling too (the page sends it there, not as `bracket`).
out = run([swap("Thought Vessel", "Rhystic Study")], {"bracket_target": 3}, bracket=None)
assert ("Thought Vessel", "Rhystic Study") in out, out
# Target 3 allows 1-3 Game Changers: of five, three are kept, counted across the list.
five = [bare_add(n) for n in GC]
out = run(five, {"bracket_target": 3}, bracket=None)
assert [a for _, a in out] == GC[:3], out
assert len(run(five, {"bracket_target": 4}, bracket=None)) == 5
# A deck already holding one: trading it for another adds none, so a target of 2
# still allows that swap and drops a new one.
WITH_GC = DECK + "\n1 Demonic Tutor"
assert mtg._deck_context(WITH_GC)["bracket"]["bracket"] == 3
out = run([swap("Demonic Tutor", "Vampiric Tutor"), swap("Cultivate", "Rhystic Study")],
          {"bracket_target": 2}, deck=WITH_GC, bracket=None)
assert list(out) == [("Demonic Tutor", "Vampiric Tutor")], out
# The cheaper pick is checked too: Narset is a Game Changer, Jace is not.
assert idx.get("Narset, Parter of Veils")["game_changer"] and not idx.get("Jace, the Mind Sculptor")["game_changer"]
jace = swap(None, "Jace, the Mind Sculptor", "Narset, Parter of Veils", action="add")
assert cheaper_of(jace)["name"] == "Narset, Parter of Veils", "at bracket 5 Narset is kept"
(only,) = run([jace], bracket=None).values()
assert only["add"] == "Jace, the Mind Sculptor" and only["cheaper"] is None, only
# Mass land denial lifts a deck to bracket 4 as well (Holiday, 2026-11-06).
assert "destroy all lands" in mtg.get_oracle_text(idx.get("Armageddon")).lower()
assert not idx.get("Armageddon")["game_changer"]
out = run([swap("Cultivate", "Armageddon")], bracket=None)
assert out == {}, out
assert ("Cultivate", "Armageddon") in run([swap("Cultivate", "Armageddon")], {"bracket_target": 4}, bracket=None)
# Brackets are Commander's: in Legacy a Game Changer-flagged staple is an ordinary pick.
LEGACY = "Deck\n56 Island\n4 Brainstorm"
assert idx.get("Force of Will")["game_changer"]
out = run([swap("Brainstorm", "Force of Will")], deck=LEGACY, bracket=None, fmt="legacy")
assert ("Brainstorm", "Force of Will") in out, out
print("ok: a Game Changer or mass land denial that would lift a Commander deck past its target, or its bracket now, is dropped")
