"""Self-check: spot removal is one definition, counted and searched the same way.
Run: python test_spot_removal_definition.py

Uses the real bulk card index on disk. No network, no AI call.

Prod failure (audit, G1 job 2b): deck_composition counted "Spot removal" with the
generous shared `removal` preset (counter target, destroy all, -X/-X), while fills
searched a separate oracle regex. So Wasteland and Dust Bowl were offered as
removal, and Wasteland + Counterspell + Toxic Deluge + Swords to Plowshares
counted as 4 removal spells instead of 1.

Two tiers: full (`spot-removal`) and light (`spot-removal-light`, bounce of
someone else's permanent). Light cards count fully but are reported as `light`
and rank below full ones in fills and budget swaps. A card any board-wipe tier
matches is a wipe only.
"""

import sys
import time

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402
from mtg_utils.card_search import _parse_sort  # noqa: E402
from mtg_utils.theme_presets import get_preset  # noqa: E402

idx = mtg._bulk_index()
COMP = {key: (full, light) for key, _, _, full, light in mtg._COMPOSITION if full}
assert COMP["removal"] == (("spot-removal",), ("spot-removal-light",)), COMP
FULL, LIGHT = get_preset("spot-removal"), get_preset("spot-removal-light")
WIPES = [get_preset(n) for n in ("board-wipe", "mass-bounce", "board-wipe-light")]


def card(name):
    c = idx.get(name)
    assert c, f"{name!r} not in bulk"
    return c


# --- 1. preset fixtures hold against real cards ----------------------------- #
for p in (FULL, LIGHT):
    assert p.should_match and p.should_not_match, p.name
    for n in p.should_match:
        assert p.matches(card(n)), f"{p.name} should match {n}"
    for n in p.should_not_match:
        assert not p.matches(card(n)), f"{p.name} should not match {n}"

# --- 2-4. the tiers Andres set ---------------------------------------------- #
MUST_FULL = (
    "Swords to Plowshares", "Path to Exile", "Doom Blade", "Lightning Bolt",
    "Prey Upon", "Beast Within", "Vindicate", "Generous Gift", "Nature's Claim",
    "Oblivion Ring", "Banishing Light", "Fireball", "Rabid Bite", "Ram Through",
    "Condemn", "Chaos Warp", "Divine Verdict", "Disfigure", "Hero's Downfall",
    "Reclamation Sage",
    # The other additions named in the brief.
    "Disintegrate", "Crater's Claws", "Soul's Fire", "Spin into Myth",
    # Decision 20: exile until the exiling permanent leaves stays full, and so
    # do a permanent-exile mode (Parting Gust) and an emblem (Venser).
    "Journey to Nowhere", "Fiend Hunter", "Detention Sphere", "Parting Gust",
    "Venser, the Sojourner",
    # Decision 22: repeatable "any target" damage engines.
    "Terror of the Peaks", "Warstorm Surge", "Kaervek the Merciless",
    # Decision 36: edicts. The generator cut these for Tergrid before.
    "Diabolic Edict", "Vraska's Fall", "Pharika's Libation", "Fleshbag Marauder",
    "Plaguecrafter", "Sheoldred's Edict", "Grave Pact",
)  # fmt: skip
# Decision 23: -1/-1 counters on a target creature are light.
LIGHT_ONLY = ("Unsummon", "Boomerang", "Necropede", "Dread Tiller", "Skinrender")
NEITHER = (
    # Decision 20: temporary flicker (returns at the next end step).
    "Flickerwisp", "Otherworldly Journey", "Astral Slide", "Roon of the Hidden Realm",
    "Twining Twins // Swift Spiral", "Mystifying Maze", "Skybind", "Voyager Staff",
    "Hide on the Ceiling", "Disorder in the Court", "Phelia, Exuberant Shepherd",
    # Blink straight back, and damage prevention (the sentence veto).
    "Eldrazi Displacer", "Flicker", "Honorable Passage", "Charm Peddler",
    # Graveyard hate whose sentence names a permanent after the card (Holiday).
    "Armored Scrapgorger", "Immersturm Predator", "Eater of the Dead",
    "Patchwork Crawler", "Morbid Bloom", "Moratorium Stone", "Arcane Proxy",
    # -1/-1 counters on your own creature; +1/+1 counters.
    "Plague Belcher", "Channeler Initiate", "Travel Preparations",
)  # fmt: skip
NEITHER += (
    "Wasteland", "Strip Mine", "Dust Bowl", "Sinkhole",  # land destruction
    "Counterspell", "Essence Scatter",  # counterspells
    "Toxic Deluge", "Wrath of God", "Cyclonic Rift", "Evacuation",  # wipes
    "Cloudshift", "Ephemerate", "Restoration Angel", "Momentary Blink",  # flicker
    "The Scarab God", "Scavenging Ooze",  # graveyard hate
    "Blighted Agent", "Core Prowler", "Necroskitter",  # Infect/Wither alone
    "Rescue", "Alley Evasion",  # returning your own permanent
    "Pacifism", "Llanowar Elves", "Giant Growth",
    # Sacrifice as your own cost, and land edicts (land destruction).
    "Village Rites", "Ashnod's Altar", "Tectonic Break",
    "Living Death", "Tragic Arrogance",  # sacrifice-all is a wipe (decision 15)
)  # fmt: skip
for n in MUST_FULL:
    assert FULL.matches(card(n)), f"{n} should be full spot removal"
for n in LIGHT_ONLY:
    assert LIGHT.matches(card(n)), f"{n} should be light spot removal"
    assert not FULL.matches(card(n)), f"{n} should not be full spot removal"
for n in NEITHER:
    hit = [p.name for p in (FULL, LIGHT) if p.matches(card(n))]
    assert not hit, f"{n} should be in neither tier, matched {hit}"
# Wipes are wipes only, through the shared Preset.matches path.
for n in ("Toxic Deluge", "Cyclonic Rift", "Damn", "Fiery Confluence"):
    assert any(w.matches(card(n)) for w in WIPES), n
    assert not FULL.matches(card(n)) and not LIGHT.matches(card(n)), n

# --- 5. Mustang's test: deck_composition ------------------------------------ #
DECK = "1 Wasteland\n1 Counterspell\n1 Toxic Deluge\n1 Swords to Plowshares"


def removal_cat(text):
    comp = mtg.deck_composition(text, fmt="commander")
    return next(c for c in comp["categories"] if c["key"] == "removal")


cat = removal_cat(DECK)
assert (cat["count"], cat["light"]) == (1, 0), cat
cat = removal_cat(DECK + "\n1 Unsummon")
assert (cat["count"], cat["light"]) == (2, 1), cat
assert cat["label"] == "Spot removal", cat

# --- 9. regression guard: no quadratic pattern ------------------------------ #
# One pass of both tiers over the commander-legal pool took ~0.6s when written
# (the five type presets they replace: ~1.1s). The ceiling is ~5x that.
legal = [
    c for c in idx.values() if (c.get("legalities") or {}).get("commander") == "legal"
]
t0 = time.perf_counter()
for c in legal:
    FULL.matches(c)
    LIGHT.matches(c)
scan_s = time.perf_counter() - t0
assert scan_s < 3.0, f"spot-removal scan took {scan_s:.1f}s over {len(legal)} cards"


# --- 6-7. the invariant: every fill candidate raises the count -------------- #
def fills(ci, sort="edhrec-desc", limit=20):
    return mtg._fill_candidates(
        mtg._FILL_SEARCH["removal"],
        color_identity=ci,
        fmt="commander",
        sort=sort,
        limit=limit,
    )


# Both callers' shapes: fills (popularity, 20) and budget swaps (price, 10).
for sort, limit in (("edhrec-desc", 20), ("price-asc", 10)):
    sort_key, reverse = _parse_sort(sort)
    for ci in ("W", "U", "B", "R", "G", "C"):
        cands = fills(ci, sort, limit)
        names = [c["name"] for c in cands]
        assert cands, (ci, sort)
        assert len(cands) <= limit and len(set(names)) == len(names), (ci, names)

        not_counted = [
            c["name"] for c in cands if not (FULL.matches(c) or LIGHT.matches(c))
        ]
        assert not not_counted, f"{ci} {sort}: {not_counted} don't count"
        wipes = [c["name"] for c in cands if any(w.matches(c) for w in WIPES)]
        assert not wipes, f"{ci} {sort}: wipes in removal fills: {wipes}"

        # The same thing through the real count: a deck of exactly these cards
        # counts every one of them, and the light ones as light.
        is_full = [FULL.matches(c) for c in cands]
        cat = removal_cat("\n".join(f"1 {n}" for n in names))
        assert cat["count"] == len(names), (ci, sort, cat, names)
        assert cat["light"] == is_full.count(False), (ci, sort, cat, names)

# Tier order over a whole pool (a 20-card fill is all full tier): every full
# candidate before any light one, each tier in the caller's sort order.
for sort in ("edhrec-desc", "price-asc"):
    sort_key, reverse = _parse_sort(sort)
    cands = fills("U", sort, limit=None)
    is_full = [FULL.matches(c) for c in cands]
    assert is_full.count(False) > 10, is_full.count(False)  # blue has bounce
    assert is_full == sorted(is_full, reverse=True), sort
    for tier in (True, False):
        part = [c for c, f in zip(cands, is_full) if f is tier]
        assert part == sorted(part, key=sort_key, reverse=reverse), (sort, tier)

# --- 8. budget swaps and role tags use the same definition ------------------ #
first = next(k for k, lbl in mtg._ROLE_CHECKS if lbl == "Removal")
assert mtg._FILL_SEARCH[first] is mtg._FILL_SEARCH["removal"], first
for n in ("Swords to Plowshares", "Unsummon", "Chaos Warp"):
    assert "Removal" in mtg._classify_roles(card(n)), n
for n in ("Toxic Deluge", "Cyclonic Rift", "Wasteland", "Counterspell", "Cloudshift"):
    assert "Removal" not in mtg._classify_roles(card(n)), n
assert "Board wipe" in mtg._classify_roles(card("Toxic Deluge"))

swaps = mtg.budget_swaps(
    "1 Vindicate\n1 Anguished Unmaking\n1 Swords to Plowshares", threshold=0.01
)["swaps"]
removal_swaps = [s for s in swaps if s["alternative"]["role"] == "Removal"]
assert removal_swaps, swaps
for s in removal_swaps:
    alt = card(s["alternative"]["name"])
    assert FULL.matches(alt) or LIGHT.matches(alt), s

print(f"test_spot_removal_definition: ok (scan {scan_s:.2f}s over {len(legal)} cards)")
