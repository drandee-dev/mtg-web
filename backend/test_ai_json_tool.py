"""Self-check for structured AI answers. Run: python test_ai_json_tool.py

Uses the real bulk card index on disk; the Anthropic client is faked, so nothing is
billed. The 2026-10-23 failure: ai_optimize asked for JSON as free text, sometimes got
something that would not parse, and the page showed 200 characters of the raw reply in
red. Now every JSON-answering call is forced through a tool whose input is the answer.

Covers: the request carries the tool (and plain calls do not), a reply with quotes in
it survives, each of the five callers sends a schema, and an unreadable reply is logged
server-side but never shown to the user.
"""

import json
import logging
import sys
from types import SimpleNamespace

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import anthropic  # noqa: E402

from app import mtg  # noqa: E402

mtg.combo_search = lambda hd: {}  # external service; not what's under test

DECK = """Commander
1 Silverquill, the Disputant

Deck
1 Esper Sentinel
1 Imp's Mischief
1 Bitterblossom
1 Phyrexian Tower
1 Cabal Ritual
1 Black Market Connections
1 Godless Shrine
1 Insatiable Avarice
1 Plains
"""

_calls: list[dict] = []
_next: list = []  # replies to hand out, oldest first


def _tool(inp, stop="tool_use"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="tool_use", name="respond", input=inp)],
        usage=SimpleNamespace(input_tokens=5, output_tokens=7),
        stop_reason=stop,
    )


def _text(text, stop="end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=5, output_tokens=7),
        stop_reason=stop,
    )


def _empty_for(schema):
    """The smallest answer the schema accepts: "" for strings, [] for arrays."""
    return {
        k: [] if v.get("type") == "array" else ""
        for k, v in schema["properties"].items()
    }


class _FakeClient:
    def __init__(self, **_):
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        _calls.append(kw)
        if _next:
            return _next.pop(0)
        return _tool(_empty_for(kw["tools"][0]["input_schema"]))


anthropic.Anthropic = _FakeClient

# --- the request: forced tool with a schema, or a plain call -------------- #
schema = {"type": "object", "properties": {"a": {"type": "string"}}}
_calls.clear()
_next[:] = [_tool({"a": 'He said "Wrath" is the answer, and\nthen left.'})]
out = mtg._ai_call("sys", "hi", api_key="test", schema=schema)
kw = _calls[0]
assert kw["tool_choice"] == {"type": "tool", "name": "respond"}, kw
assert kw["tools"][0]["name"] == "respond" and kw["tools"][0]["input_schema"] == schema, kw
assert "respond" in kw["system"] and kw["system"].startswith("sys"), kw["system"]
assert kw.get("thinking") == {"type": "disabled"}, kw  # forced tools need thinking off
# Quotes and a newline inside a string come back as JSON that parses to the same text.
assert json.loads(out["result"]) == {"a": 'He said "Wrath" is the answer, and\nthen left.'}
assert out["stop_reason"] == "tool_use", out

_calls.clear()
_next[:] = [_text("plain prose")]
out = mtg._ai_call("sys", "hi", api_key="test")
assert "tools" not in _calls[0] and "tool_choice" not in _calls[0], _calls[0]
assert _calls[0]["system"] == "sys", "a plain call must not change the system prompt"
assert out["result"] == "plain prose", out

# A schema call whose reply has no tool block (a refusal, say) still returns the text.
_next[:] = [_text("I cannot help with that.")]
out = mtg._ai_call("sys", "hi", api_key="test", schema=schema)
assert out["result"] == "I cannot help with that.", out

# --- end to end: quotes in a reason no longer break ai_optimize ----------- #
_next[:] = [
    _tool(
        {
            "assessment": 'A "casualty" deck with no sweepers.',
            "changes": [
                {
                    "action": "swap",
                    "cut": "Imp's Mischief",
                    "add": "Wrath of God",
                    "reason": 'Wrath is the "clean" answer here.',
                    "category": "Board wipe",
                    "impact": "high",
                }
            ],
        }
    )
]
res = mtg.ai_optimize(DECK, fmt="commander", api_key="test")
assert res["error"] is False and len(res["changes"]) == 1, res
assert res["changes"][0]["add"] == "Wrath of God", res
assert '"clean"' in res["changes"][0]["reason"], res

# --- every JSON caller sends a schema ------------------------------------- #
callers = {
    "optimize": lambda: mtg.ai_optimize(DECK, fmt="commander", api_key="test"),
    "strategy": lambda: mtg.ai_strategy(DECK, fmt="commander", api_key="test"),
    "explain": lambda: mtg.ai_explain_recommendations(
        DECK, ["Sol Ring"], fmt="commander", api_key="test"
    ),
    "combos": lambda: mtg.ai_combo_guidance(DECK, [], [], fmt="commander", api_key="test"),
    "fills": lambda: mtg.ai_composition_fills(DECK, fmt="commander", api_key="test"),
}
for name, run in callers.items():
    _calls.clear()
    _next.clear()
    run()
    assert _calls, f"{name}: made no AI call (a fills deck needs a thin category)"
    assert all("tool_choice" in c for c in _calls), f"{name}: sent no schema"

# --- an unreadable reply is logged, never shown --------------------------- #
RAW = '{"assessment": "SECRET-RAW-TEXT the deck is", "changes": [{"reason": "cut off mid'


class _Capture(logging.Handler):
    def emit(self, record):
        _logged.append(record)


_logged: list[logging.LogRecord] = []
_log = logging.getLogger("mtg-web")
_log.addHandler(_Capture())
_log.propagate = False


def unreadable(run):
    _logged.clear()
    # A schema call whose reply came back as cut-off text, not a tool block.
    _next[:] = [_text(RAW, stop="max_tokens")] * 8
    return run()


res = unreadable(callers["optimize"])
assert res["error"] is True and res["message"] == mtg.AI_UNREADABLE_MESSAGE, res
assert "SECRET-RAW-TEXT" not in json.dumps(res), res
rec = [r.getMessage() for r in _logged]
assert len(rec) == 1 and "optimize" in rec[0] and "max_tokens" in rec[0], rec
assert "SECRET-RAW-TEXT" in rec[0], "the raw head must reach the server log"

res = unreadable(callers["explain"])
assert "SECRET-RAW-TEXT" not in json.dumps(res), res
assert res["explanations"][0]["explanation"] == mtg.AI_UNREADABLE_MESSAGE, res
assert len(_logged) == 1, _logged

res = unreadable(callers["combos"])
assert "SECRET-RAW-TEXT" not in json.dumps(res), res
assert res["assessments"][0]["reason"] == mtg.AI_UNREADABLE_MESSAGE, res
assert len(_logged) == 1, _logged

# --- an optimize that keeps nothing says why in the log ------------------- #
BAD = {
    "assessment": "x",
    "changes": [
        {"action": "swap", "cut": "Imp's Mischief", "add": "Not A Real Card",
         "reason": "r", "category": "Ramp", "impact": "low"},
        {"action": "swap", "cut": "Card Not In Deck", "add": "Wrath of God",
         "reason": "r", "category": "Board wipe", "impact": "low"},
    ],
}
for label, answer, expect_in_log in (
    ("all rejected", BAD, "'Not A Real Card'"),
    ("none proposed", {"assessment": "x", "changes": []}, "0 proposed"),
):
    _logged.clear()
    _next[:] = [_tool(answer)]
    res = mtg.ai_optimize(DECK, fmt="commander", api_key="test")
    assert res["error"] is False and res["changes"] == [], (label, res)
    msgs = [r.getMessage() for r in _logged]
    assert len(msgs) == 1 and "no changes kept" in msgs[0] and expect_in_log in msgs[0], (
        label,
        msgs,
    )
# A run that keeps something stays quiet.
_logged.clear()
_next[:] = [_tool({"assessment": "x", "changes": [BAD["changes"][0], {
    "action": "swap", "cut": "Imp's Mischief", "add": "Wrath of God",
    "reason": "r", "category": "Board wipe", "impact": "high"}]})]
assert len(mtg.ai_optimize(DECK, fmt="commander", api_key="test")["changes"]) == 1
assert not _logged, [r.getMessage() for r in _logged]

print("ok: structured answers, five callers, unreadable replies logged not shown")
