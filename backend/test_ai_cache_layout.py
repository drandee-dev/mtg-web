"""Self-check for the shared-prefix caching restructure. Run: python test_ai_cache_layout.py

Hermetic: spies on _ai_call so no real API call happens, no cost. Uses the real
bulk card index (already on disk for local dev) to build one real decklist and
exercise the rewritten endpoints against it.

This checks the one property the whole caching lever depends on: that every
endpoint sends the SAME `system` string and the SAME first content-block text
for the SAME deck. If either varies, Anthropic's cache prefix can never be
shared across endpoints no matter how the rest of the message is built — see
mtg.py's comment above _DECKBUILDER_SYSTEM for why.

The old cuts/upgrades AI endpoints were deleted (Job 9, 2026-09-22): the
Changes tab's deep pass now runs entirely through ai_optimize (Job 1). This
file keeps testing the shared-cache property across the endpoints that remain.
"""
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

DECKLIST = "\n".join(
    ["1 Atraxa, Praetors' Voice"]
    + [f"1 {n}" for n in [x for x in list(mtg._bulk_index())[:400] if x.isascii()][:99]]
)

# Captures each call's (system, messages) without hitting the network. Each
# endpoint parses `result` differently downstream (a JSON object vs. a JSON
# array of a specific shape), so the mock response is shaped per call, in the
# fixed order _run_all makes them — the test only cares what was SENT, not
# what a real response would say, but the harness has to hand back something
# each endpoint's own parsing can consume without crashing.
_captured: list[dict] = []
_RESPONSES = [
    '{"strategy":"x","archetype":"y"}',  # ai_strategy
    "[]",  # ai_explain_recommendations
    '{"assessment":"x","changes":[]}',  # ai_optimize
]


def _spy(system, user_msg=None, *, messages=None, **kw):
    _captured.append({"system": system, "messages": messages, "user_msg": user_msg})
    return {"error": False, "result": _RESPONSES[len(_captured) - 1], "model": "spy"}


def _run_all(goals=None):
    _captured.clear()
    real = mtg._ai_call
    mtg._ai_call = _spy
    try:
        mtg.ai_strategy(DECKLIST, commander="Atraxa, Praetors' Voice")
        mtg.ai_explain_recommendations(DECKLIST, ["Sol Ring", "Rhystic Study"], goals=goals)
        mtg.ai_optimize(DECKLIST, goals=goals)
    finally:
        mtg._ai_call = real
    assert len(_captured) == 3, f"expected 3 calls, got {len(_captured)}"
    return list(_captured)


def test_every_endpoint_shares_one_system_string():
    calls = _run_all()
    systems = {c["system"] for c in calls}
    assert systems == {mtg._DECKBUILDER_SYSTEM}, systems
    print("ok: all 3 calls (3 endpoints) share one system string")


def test_payload_block_is_byte_identical_across_endpoints():
    """This is the actual lever: if this fails, cross-endpoint caching cannot
    work no matter what system strings match, because the messages differ."""
    calls = _run_all()
    payloads = set()
    for c in calls:
        assert c["messages"], "endpoint did not use the messages= path"
        first_block = c["messages"][0]["content"][0]
        assert first_block.get("cache_control") == {"type": "ephemeral"}, first_block
        payloads.add(first_block["text"])
    assert len(payloads) == 1, f"payload block differs across endpoints: {len(payloads)} distinct variants"
    print("ok: every endpoint's first content block is the same bytes, and cached")


def test_instruction_block_is_also_cached_and_endpoint_specific():
    calls = _run_all()
    instructions = []
    for c in calls:
        second_block = c["messages"][0]["content"][1]
        assert second_block.get("cache_control") == {"type": "ephemeral"}, second_block
        instructions.append(second_block["text"])
    # All 3 calls have their own instruction text.
    assert len(set(instructions)) == 3, instructions
    print("ok: each endpoint's instruction block is its own text, still cached")


def test_free_text_goals_never_enter_the_cached_blocks():
    """The injection-safety property this restructure must not weaken: the
    <user_input>-wrapped free text stays out of both cache breakpoints.

    ai_strategy (call 0) takes no `goals` param at all, so it carries no
    <user_input> text either way — its 3rd block, when present, is the
    trusted commander-name fallback (see ai_strategy's own comment), not
    free text, and correctly has no <user_input> wrapping. Every other
    endpoint here DOES take goals, and with protected/flavor_note set, MUST
    show <user_input> somewhere, outside the cached blocks.
    """
    goals = {"protected": ["Sol Ring"], "flavor_note": "no infinite combos please"}
    calls = _run_all(goals=goals)
    for i, c in enumerate(calls):
        blocks = c["messages"][0]["content"]
        cached_text = "".join(b["text"] for b in blocks if b.get("cache_control"))
        assert "<user_input>" not in cached_text, f"call {i}: free text leaked into a cached block"
        if i == 0:
            continue  # ai_strategy: no goals param, nothing to assert beyond the above
        all_text = "".join(b["text"] for b in blocks)
        assert "<user_input>" in all_text, f"call {i}: goal free text vanished entirely"
    print("ok: <user_input>-wrapped goal text stays out of the cached blocks")


def test_validated_goal_scalars_are_in_the_cached_instruction_block():
    """Bracket/budget/pilot ARE meant to be cached (repeat calls, same goals,
    same deck, should hit) — only the free-text half is tail-only.
    ai_strategy (call 0) takes no goals param, so it's exempt — see the
    previous test's docstring."""
    goals = {"bracket_target": 2, "budget_ceiling": 100}
    calls = _run_all(goals=goals)
    for i, c in enumerate(calls):
        if i == 0:
            continue
        second_block = c["messages"][0]["content"][1]
        assert "Target bracket: 2" in second_block["text"], (i, second_block["text"][:200])
    print("ok: validated goal scalars ride in the cached instruction block")


if __name__ == "__main__":
    test_every_endpoint_shares_one_system_string()
    test_payload_block_is_byte_identical_across_endpoints()
    test_instruction_block_is_also_cached_and_endpoint_specific()
    test_free_text_goals_never_enter_the_cached_blocks()
    test_validated_goal_scalars_are_in_the_cached_instruction_block()
    print("\nall passed")
