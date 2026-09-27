"""Self-check for AI response-shape handling. Run: python test_ai_response_shapes.py

Hermetic: no network, no bulk data. Fakes the Anthropic client and spies on
_ai_call, so nothing is billed.

Covers two production failures (2026-09-27):
1. Silent chat. _ai_call_stream left Sonnet 5's thinking on, the model spent
   all of max_tokens thinking, and the stream ended "done" with empty text.
   The chat UI then showed its "Thinking..." placeholder forever. The stream
   must disable thinking and turn an empty reply into an error event.
2. Fills crash. The model answered the fills prompt with a JSON object instead
   of the requested list and `p.get` on its string keys raised AttributeError
   (a 500). _parse_ai_json(expect=...) coerces or rejects the shape once for
   every caller.
"""

import json
import sys
from types import SimpleNamespace

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import anthropic  # noqa: E402

from app import mtg  # noqa: E402

# --- _parse_ai_json shape coercion ---------------------------------------- #
p = mtg._parse_ai_json

# A list wrapped in an object (the fills crash) yields the first list field.
assert p('{"picks": [{"name": "Sol Ring"}]}', expect=list) == [{"name": "Sol Ring"}]
assert p('{"note": "x", "picks": [1]}', expect=list) == [1]
# An object with no list field cannot become a list.
for raw in ('{"name": "Sol Ring"}', '"just a string"', "42"):
    try:
        p(raw, expect=list)
        raise AssertionError(f"expect=list accepted {raw}")
    except ValueError:
        pass
# A bare list where an object is expected (strategy, combo guidance) raises.
for raw in ('[{"strategy": "x"}]', '"x"', "null"):
    try:
        p(raw, expect=dict)
        raise AssertionError(f"expect=dict accepted {raw}")
    except ValueError:
        pass
# Fenced JSON and preamble still parse.
assert p('```json\n[{"name": "A"}]\n```', expect=list) == [{"name": "A"}]
assert p('```json\n{"strategy": "s"}\n```', expect=dict) == {"strategy": "s"}
# Preamble around an object with one inner array: the object wins, not the array.
assert p('Sure: {"assessments": [{"combo": "c"}]}', expect=dict) == {
    "assessments": [{"combo": "c"}]
}
# expect=None is unchanged; ai_optimize's (dict, list) passes both through.
assert p("[1]") == [1] and p('{"a": 1}') == {"a": 1}
assert p("[1]", expect=(dict, list)) == [1]
try:
    p('"x"', expect=(dict, list))
    raise AssertionError("expect=(dict, list) accepted a string")
except ValueError:
    pass

# --- ai_composition_fills survives the shapes that crashed it ------------- #
mtg._deck_context_cached = lambda *a, **k: {
    "deck": {"format": "commander", "cards": []},
    "hd": None,
    "commanders": [],
}
mtg.deck_composition = lambda *a, **k: {
    "categories": [
        {"key": "ramp", "label": "Ramp", "status": "thin", "count": 2, "target": 10}
    ]
}
mtg._search_cards = lambda *a, **k: [{"name": "Sol Ring"}, {"name": "Arcane Signet"}]


def _fills_with(result: str) -> list:
    mtg._ai_call = lambda *a, **k: {"error": False, "result": result}
    out = mtg.ai_composition_fills("1 Sol Ring", api_key="test")
    assert out["error"] is False, out
    return [s["name"] for s in out["fills"][0]["suggestions"]]


# The production crash: an object instead of a list.
assert _fills_with('{"picks": [{"name": "Arcane Signet", "reason": "r"}]}') == [
    "Arcane Signet"
]
# Non-dict items in the list are skipped, not called .get on.
assert _fills_with('["Sol Ring", {"name": "Arcane Signet"}]') == ["Arcane Signet"]
# An object with no list falls back to the deterministic pool.
assert _fills_with('{"name": "Sol Ring"}') == ["Sol Ring", "Arcane Signet"]


# --- _ai_call_stream: thinking off, empty reply is an error --------------- #
class _FakeStream:
    def __init__(self, chunks):
        self.text_stream = iter(chunks)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return SimpleNamespace(
            usage=SimpleNamespace(input_tokens=10, output_tokens=2000)
        )


_calls: list[dict] = []
_chunks: list[str] = []


class _FakeClient:
    def __init__(self, **_):
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        _calls.append(kwargs)
        return _FakeStream(list(_chunks))


anthropic.Anthropic = _FakeClient
_usage: list = []
mtg.on_ai_usage = lambda model, usage: _usage.append((model, usage.output_tokens))


def _events() -> list[dict]:
    out = mtg._ai_call_stream("sys", "hi", api_key="test", max_tokens=2000)
    return [json.loads(e.removeprefix("data: ").strip()) for e in out]


for empty in ([], ["", "  \n"]):
    _calls.clear()
    _usage.clear()
    _chunks[:] = empty
    events = _events()
    assert _calls[0]["model"] == "claude-sonnet-5", _calls
    assert _calls[0].get("thinking") == {"type": "disabled"}, _calls[0]
    assert events[-1]["status"] == "error", events
    assert events[-1]["message"] == mtg.EMPTY_REPLY_MESSAGE, events
    assert not any(e["status"] == "done" for e in events), events
    # Tokens were spent, so usage is still recorded against the budget.
    assert _usage == [("claude-sonnet-5", 2000)], _usage

# A normal reply still ends "done" with the full text.
_chunks[:] = ["Hello", " there"]
events = _events()
assert events[-1]["status"] == "done" and events[-1]["text"] == "Hello there", events

print("OK: _parse_ai_json shapes, fills shapes, stream thinking + empty reply")
