"""Self-check: every suggestion source sees how this commander is actually played.
Run: python test_commander_strategy.py

Suggestions job 2 (projects/mtg-web-suggestions-scope.md). Andres, 2026-10-24: "card
suggestions for all commander decks should also always consider the commanders specific
strategy". The shared deck context gains the commander's EDHREC themes and most played
cards; fills, which writes its own prompt, gets that and every commander's text.

Uses the real bulk card index on disk. EDHREC and the Anthropic client are stubbed:
no network, no cost. The stub page has the shape edhrec_lookup returned live for
Silverquill and Atraxa on 2026-10-24 (per-type lists plus theme tags).
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402

mtg.combo_search = lambda hd: {}  # external service; not what's under test

DECK = """Commander
1 Silverquill, the Disputant

Deck
1 Swords to Plowshares
1 Bitterblossom
1 Plains
1 Swamp
"""
PARTNERS = """Commander
1 Thrasios, Triton Hero
1 Tymna the Weaver

Deck
1 Sol Ring
"""


def cv(name, decks, of=1000):
    return {"name": name, "synergy": 0.2, "inclusion": 0, "num_decks": decks, "potential_decks": of}


def page(of=1000):
    return {
        "high_synergy": [],
        # One card in the deck, one not: the "(in this deck)" mark needs both.
        "instants": [cv("Swords to Plowshares", 750, of), cv("Village Rites", 560, of)],
        "lands": [cv("Fetid Heath", 530, of)],
        "themes": [{"name": "Tokens", "count": 920}, {"name": "Aristocrats", "count": 487}],
    }


calls: list = []


def use(pg=None, boom=False):
    def stub(names, timeout=None):
        calls.append((list(names), timeout))
        if boom:
            raise ConnectionError("EDHREC down (stub)")
        return pg

    mtg.edhrec_lookup = stub
    mtg._cardlists_cache.clear()
    mtg._ctx_cache.clear()
    calls.clear()


SECTION = "## How this commander is built"

# --- the shared context carries the commander's strategy ------------------- #
use(page())
ctx = mtg._deck_context(DECK, "commander")
s = ctx["summary"]
assert SECTION in s and "(EDHREC, 1000 decks)" in s, s[-1500:]
assert "Tokens (920 decks), Aristocrats (487 decks)" in s, s[-1500:]
assert "Swords to Plowshares 75% (in this deck)" in s, s[-1500:]
assert "Village Rites 56%" in s and "Village Rites 56% (in" not in s, s[-1500:]
# Lands are mana, not strategy: they stay out of "most played".
assert "Fetid Heath" not in s.split(SECTION)[1], s[-1500:]
assert calls == [(["Silverquill, the Disputant"], 3)], calls
assert "Tokens (920 decks)" in ctx["commander_notes"], ctx["commander_notes"]
assert "Commander cares about" in ctx["commander_notes"], ctx["commander_notes"]
print("ok: the deck context says how this commander is built")

# Down, too small, or not a commander format: no section, and the context still builds.
for label, setup, fmt in (
    ("EDHREC down", lambda: use(boom=True), "commander"),
    ("12 decks", lambda: use(page(of=12)), "commander"),
):
    setup()
    s = mtg._deck_context(DECK, fmt)["summary"]
    assert SECTION not in s and "## Decklist" in s, (label, s[-400:])
use(page())
mtg._deck_context("Deck\n4 Lightning Bolt\n", "modern")
assert calls == [], f"a deck with no commander asked EDHREC: {calls}"
# "All commander decks": a Brawl deck has a commander, so it gets the profile too.
use(page())
s = mtg._deck_context("Commander\n1 Silverquill, the Disputant\n\nDeck\n1 Plains\n", "brawl")["summary"]
assert calls and SECTION in s, f"a Brawl deck got no commander strategy: {calls}"
print("ok: no section when EDHREC is down, the sample is small, or there is no commander; Brawl gets it")

# --- every AI source that reads the shared context sends it ---------------- #
sent: list[str] = []


def spy(system, user_msg=None, *, messages=None, **kw):
    parts = [user_msg or ""]
    for m in messages or []:
        c = m["content"]
        parts += [c] if isinstance(c, str) else [b.get("text", "") for b in c]
    sent.append("\n".join(parts))
    return {"error": True, "result": "stub"}


real_ai_call = mtg._ai_call
mtg._ai_call = spy
use(page())
for name, run in {
    "optimize / power upgrades": lambda: mtg.ai_optimize(DECK, api_key="t"),
    "strategy": lambda: mtg.ai_strategy(DECK, api_key="t"),
    "explain": lambda: mtg.ai_explain_recommendations(DECK, ["Sol Ring"], api_key="t"),
    "combos": lambda: mtg.ai_combo_guidance(DECK, [], [], api_key="t"),
    "fills": lambda: mtg.ai_composition_fills(DECK, api_key="t"),
}.items():
    sent.clear()
    run()
    assert sent, f"{name}: made no AI call"
    assert all("Tokens (920 decks)" in m for m in sent), f"{name}: no commander strategy sent"
print("ok: optimize, strategy, explain, combos and fills all send it")

# --- fills: commander-first pool and every commander's text ---------------- #
use(page())
sent.clear()
out = mtg.ai_composition_fills(DECK, api_key="t")
lands = next(f for f in out["fills"] if f["category"] == "Lands")
assert lands["pool"][0]["name"] == "Fetid Heath", lands["pool"][:3]
assert lands["pool"][0]["reason"] == "Played in 53% of this commander's decks", lands["pool"][0]
use(page())
sent.clear()
mtg.ai_composition_fills(PARTNERS, api_key="t")
assert sent, "partner deck made no fills call"
oracle = lambda n: mtg._full_oracle(mtg._bulk_index().get(n))  # noqa: E731
for name in ("Thrasios, Triton Hero", "Tymna the Weaver"):
    assert oracle(name)[:40] in sent[0], f"fills prompt lacks {name}'s text"
mtg._ai_call = real_ai_call
print("ok: fills ranks this commander's picks first and sends every commander's text")

# --- Suggestions never shows theme tags as a card category ----------------- #
use(page())
rec = mtg.deck_recommendations(DECK, fmt="commander")
assert "themes" not in rec["categories"], list(rec["categories"])
print("ok: themes stay out of Suggestions' card categories")
