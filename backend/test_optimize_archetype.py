"""Self-check: Strategy's archetype reaches Optimize as a wrapped, capped hint.
Run: python test_optimize_archetype.py

Audit job 3.2 (vault projects/mtg-web-audit-2026-11-25.md). Strategy read the Sliver
precon as "Tribal Aggro (Slivers)" while Optimize cut seven Slivers: the calls shared
nothing. Anthropic and EDHREC stubbed; no network, no cost.
"""

import sys

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import main, mtg

mtg.combo_search = lambda hd: {}
mtg.edhrec_lookup = lambda names, timeout=None: {}

DECK = """Commander
1 Sliver Gravemother

Deck
1 Regal Sliver
1 Sol Ring
1 Plains
"""
sent: list[list[dict]] = []


def spy(system, user_msg=None, *, messages=None, **kw):
    sent.append(messages[0]["content"])
    return {"error": True, "result": "stub"}


mtg._ai_call = spy

# --- the prompt: only in the uncached tail, wrapped, capped ------------------ #
mtg.ai_optimize(DECK, archetype="Tribal Aggro (Slivers)", api_key="t")
blocks = sent[-1]
cached, tail = blocks[:2], blocks[-1]
assert all("cache_control" in b for b in cached) and "cache_control" not in tail, blocks
assert "<user_input>Tribal Aggro (Slivers)</user_input>" in tail["text"], tail["text"]
assert not any("Tribal Aggro" in b["text"] for b in cached), (
    "archetype leaked into a cached block"
)

mtg.ai_optimize(DECK, archetype="x" * 500, api_key="t")
assert "<user_input>" + "x" * 60 + "</user_input>" in sent[-1][-1]["text"]

for empty in ("", "   ", None):
    mtg.ai_optimize(DECK, archetype=empty, api_key="t")
    assert not any("An earlier read of this deck" in b["text"] for b in sent[-1]), empty
print("ok: the archetype rides the uncached tail, wrapped and capped at 60")

# --- the endpoint: passes a string through, drops anything else -------------- #
got: list = []
real_optimize = mtg.ai_optimize
mtg.ai_optimize = lambda *a, **kw: got.append(kw.get("archetype")) or {"changes": []}
main._check_ai_access = lambda request: None
for value, want in (
    ("  Voltron  ", "Voltron"),
    ("y" * 300, "y" * 60),
    (["Voltron"], ""),
    (None, ""),
    (7, ""),
):
    main.deck_optimize(
        None, {"decklist": DECK, "format": "commander", "archetype": value}
    )
    assert got[-1] == want, (value, got[-1])
main.deck_optimize(None, {"decklist": DECK, "format": "commander"})
assert got[-1] == "", got[-1]
mtg.ai_optimize = real_optimize
print("ok: the endpoint trims, caps and drops a non-string archetype")
