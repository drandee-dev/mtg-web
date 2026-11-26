"""Self-check: Optimize's theme lock and land floor, replayed on the audit's answers.
Run: python test_optimize_guards.py

Audit job 3.4 (vault projects/mtg-web-audit-2026-11-25.md). Two paid Optimize answers
saved by the audit (test_fixtures/optimize/) are fed back through a stubbed _ai_call:
Sliver Swarm cut seven Slivers for Grave Pact and friends, Veloci-Ramp-Tor cut four
lands for spells. Real bulk index; EDHREC stubbed; no network, no cost.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg
from mtg_utils.mana_audit import mana_audit

mtg.combo_search = lambda hd: {}
mtg.edhrec_lookup = lambda names, timeout=None: {}
HERE = Path(__file__).parent / "test_fixtures"
idx = mtg._bulk_index()
sent: list[str] = []


def replay(slug):
    """The saved answer as the model's JSON (its picks only), through ai_optimize."""
    saved = json.loads((HERE / "optimize" / f"{slug}.ai_optimize.json").read_text())
    answer = {
        "assessment": saved["assessment"],
        "changes": [
            {
                k: c.get(k)
                for k in ("action", "cut", "add", "reason", "category", "impact")
            }
            for c in saved["changes"]
        ],
    }

    def stub(system, user_msg=None, *, messages=None, **kw):
        sent.append(messages[0]["content"][-1]["text"])
        return {"error": False, "result": json.dumps(answer), "model": "replay"}

    mtg._ai_call = stub
    mtg._ctx_cache.clear()
    mtg._cardlists_cache.clear()
    text = (HERE / "precons" / f"{slug}.txt").read_text()
    out = mtg.ai_optimize(text, api_key="t")
    return out, mtg._deck_context(text, "commander")


# --- Sliver Swarm: no Sliver leaves for an off-theme card -------------------- #
out, ctx = replay("sliver-swarm")
theme = ctx["theme"]
for c in out["changes"]:
    cut = idx.get(c["cut"]) if c["cut"] else None
    assert not (cut and "tribe" in theme.reasons(cut)), c
held_cuts = {h["cut"] for h in out["held_back"]}
for name in [
    "Diffusion Sliver",
    "Shifting Sliver",
    "Hollowhead Sliver",
    "Crypt Sliver",
]:
    assert name in held_cuts, (name, out["held_back"])
assert any(c["cut"] == "Windfall" for c in out["changes"]), "an off-theme cut stays"
assert out["held_back_note"].startswith(
    f"{len(out['held_back'])} changes held back: "
), out
assert out["held_back_note"].endswith(": they would cut your Slivers."), out[
    "held_back_note"
]
print(f"ok: Sliver Swarm keeps every Sliver ({out['held_back_note']})")

# Audit job 3.8: the tail names the theme cards and the cards free to cut.
tail = sent[-1]
theme_part = tail.split("Theme cards (cut one only")[1].split("\n\n")[0]
free_part = tail.split("Nonland cards outside the theme: ")[1].split("\n\n")[0]
assert "Diffusion Sliver" in theme_part and "Distant Melody" in theme_part, theme_part
assert "Windfall" in free_part and "Sliver" not in free_part, free_part
assert "Plains" not in free_part and "suggest 8 changes" in free_part, free_part
print("ok: the prompt lists the theme cards and the cards outside the theme")

# --- Veloci-Ramp-Tor: never under the land floor ----------------------------- #
out, ctx = replay("veloci-ramp-tor")
audit = mana_audit(ctx["hd"])
floor, lands = audit["land_count_floor"], audit["land_count"]
after = lands + sum(
    mtg._land_flag(idx.get(c["add"])) - mtg._land_flag(idx.get(c["cut"]))
    for c in out["changes"]
    if c["cut"] and c["add"]
)
assert after >= floor, (lands, after, floor, out["changes"])
assert any(h["reason"] == "lands" for h in out["held_back"]), (
    lands,
    floor,
    out["held_back"],
)
assert f"would leave fewer than {floor} lands" in out["held_back_note"], out[
    "held_back_note"
]
for c in out["changes"]:  # the Dinosaur lock too
    cut = idx.get(c["cut"]) if c["cut"] else None
    assert not (cut and "tribe" in ctx["theme"].reasons(cut)), c
print(
    f"ok: Veloci-Ramp-Tor keeps {after} lands, floor {floor} ({out['held_back_note']})"
)

# --- the prompt names both rules ----------------------------------------------- #
assert (
    f"must keep at least {floor}" in sent[-1] and "same part of the theme" in sent[-1]
)
print("ok: the prompt is told about both guards")

# --- a deck already under the floor loses no land ---------------------------- #
text = (HERE / "precons" / "veloci-ramp-tor.txt").read_text()
short = text.replace("4 Forest", "1 Forest").replace("2 Mountain", "1 Mountain")
assert short != text, "the basics lines changed shape: nothing was removed"
mtg._ctx_cache.clear()
hd = mtg._deck_context(short, "commander")["hd"]
a = mana_audit(hd)
assert a["land_count"] < a["land_count_floor"], (a["land_count"], a["land_count_floor"])


def stub_one(system, user_msg=None, *, messages=None, **kw):
    one = {"action": "swap", "cut": "Exotic Orchard", "add": "Ghalta, Primal Hunger"}
    return {"error": False, "result": json.dumps({"assessment": "", "changes": [one]})}


mtg._ai_call = stub_one
out = mtg.ai_optimize(short, api_key="t")
assert not out["changes"] and out["held_back"][0]["reason"] == "lands", out
print("ok: a deck already under its floor loses no land")
