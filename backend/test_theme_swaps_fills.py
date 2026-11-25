"""Self-check: budget swaps keep the theme, fills rank it first, Protection means
protecting something else. Run: python test_theme_swaps_fills.py

Audit job 3.3 (vault projects/mtg-web-audit-2026-11-25.md). The audit's saved swaps:
Synapse Sliver -> Solemn Simulacrum, Syphon Sliver -> Blood Artist, Apex Altisaur ->
Terastodon, Xenagos -> Hulking Raptor as "Protection". Real bulk index; EDHREC and
Anthropic stubbed, no network, no cost. Prices come from the local bulk file, so the
checks are about which alternatives are allowed, never a fixed list.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

os.environ.pop("ANTHROPIC_API_KEY", None)  # fills return the pool, no AI call
mtg.combo_search = lambda hd: {}
mtg.edhrec_lookup = lambda names, timeout=None: {}
PRECONS = Path(__file__).parent / "test_fixtures" / "precons"
idx = mtg._bulk_index()


def deck(slug):
    return (PRECONS / f"{slug}.txt").read_text()


def theme_of(slug):
    mtg._ctx_cache.clear()
    mtg._cardlists_cache.clear()
    return mtg._deck_context(deck(slug), "commander")["theme"]


# --- Protection is a role for cards that protect something else ------------- #
roles = lambda n: mtg._classify_roles(idx.get(n))
for name in ["Xenagos, God of Revels", "Hulking Raptor"]:
    assert "Protection" not in roles(name), (name, roles(name))
for name in [
    "Sliver Hivelord",
    "Akroma's Will",
    "Lightning Greaves",
    "Heroic Intervention",
]:
    assert "Protection" in roles(name), (name, roles(name))
# Budget swaps searches the role too: the search must still find protection cards.
found = mtg._fill_candidates(
    mtg._oracle_role_search("Protection"),
    color_identity="WRG",
    fmt="commander",
    sort="edhrec-desc",
    limit=30,
)
assert len(found) >= 10 and all(mtg._grants_protection(c) for c in found), len(found)
assert mtg._oracle_role_search("Recursion")["oracle"], "string roles keep their regex"
print("ok: a keyword alone on its own line is not the Protection role")

# --- budget swaps keep the theme ------------------------------------------- #
total = 0
for slug, banned in (
    (
        "sliver-swarm",
        {("Synapse Sliver", "Solemn Simulacrum"), ("Syphon Sliver", "Blood Artist")},
    ),
    (
        "veloci-ramp-tor",
        {("Apex Altisaur", "Terastodon"), ("Xenagos, God of Revels", "Hulking Raptor")},
    ),
    ("undead-unleashed", set()),
    ("silverquill-statement", set()),
):
    theme = theme_of(slug)
    mtg._cardlists_cache.clear()
    res = mtg.budget_swaps(deck(slug), fmt="commander")
    assert res["v"] == 3, res["v"]
    for s in res["swaps"]:
        old, new = idx.get(s["card"]), idx.get(s["alternative"]["name"])
        pair = (s["card"], s["alternative"]["name"])
        assert pair not in banned, pair
        assert theme.keeps_theme(old, new), (
            slug,
            pair,
            theme.reasons(old),
            theme.reasons(new),
        )
        if "tribe" in theme.reasons(old):
            assert "tribe" in theme.reasons(new), pair
        total += 1
assert total, "no swaps at all: the check above checked nothing"
print(f"ok: {total} budget swaps across the four precons all keep the theme")

# keeps_theme on its own: tribe beats a shared mechanic.
t = theme_of("veloci-ramp-tor")
apex, tera = idx.get("Apex Altisaur"), idx.get("Terastodon")
assert "etb" in t.reasons(tera) and not t.keeps_theme(apex, tera)
assert t.keeps_theme(idx.get("Sol Ring"), idx.get("Arcane Signet"))  # off theme: free
print("ok: a tribe card needs a tribe card even when a mechanic is shared")

# --- fills rank on-theme candidates first ---------------------------------- #
checked = 0
for slug in ("sliver-swarm", "undead-unleashed", "veloci-ramp-tor"):
    theme = theme_of(slug)
    out = mtg.ai_composition_fills(deck(slug), fmt="commander")
    for f in out["fills"]:
        flags = [theme.on_theme(idx.get(p["name"])) for p in f["pool"]]
        assert flags == sorted(flags, reverse=True), (slug, f["category"], f["pool"])
        checked += any(flags) and not all(flags)
assert checked, "no pool mixed on- and off-theme cards: the order was never tested"
print(f"ok: fills list on-theme cards first ({checked} mixed pools checked)")
