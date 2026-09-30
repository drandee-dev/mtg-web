"""Self-check: ramp is one definition, counted, searched and tagged the same way.
Run: python test_ramp_definition.py

Uses the real bulk card index on disk. No network, no AI call.

Prod failure (audit, G2b): three ramp definitions disagreed. The Ramp count used
card_classify.is_ramp, fills searched an oracle regex that matched 1,145 lands
(Command Tower, Evolving Wilds), and the Ramp role tag used a third set of regexes.
So ramp fills offered lands that never raised the count, is_ramp missed Gilded Lotus
and Three Visits, and the role tag missed Cultivate.

Two tiers (decisions 30-32, 34-38): full (repeatable mana, land-untapping dorks, a
land from the library onto the battlefield, repeatable Treasure) and light (extra land
drops, a land fetched to hand, one-shot mana). Landcycling is neither. Light
cards count fully but are reported as `light` and rank below full ones in fills and
budget swaps. Lands, MDFCs with a land face included, are never ramp.
"""

import re
import sys
import time

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402
from mtg_utils.card_classify import (  # noqa: E402
    RAMP_PREFILTER,
    classify_cube_category,
    get_oracle_text,
    is_land,
    ramp_tier,
)
from mtg_utils.card_search import _parse_sort  # noqa: E402

idx = mtg._bulk_index()


def card(name):
    c = idx.get(name)
    assert c, f"{name!r} not in bulk"
    return c


# --- 1. the tiers Andres set ------------------------------------------------ #
FULL = (
    # Rocks, dorks, a nonland devotion source, a land Aura.
    "Sol Ring", "Arcane Signet", "Gilded Lotus", "Llanowar Elves", "Bloom Tender",
    "Karametra's Acolyte", "Utopia Sprawl",
    # A land from the library onto the battlefield.
    "Rampant Growth", "Cultivate", "Kodama's Reach", "Three Visits", "Nature's Lore",
    "Farseek", "Wood Elves", "Burnished Hart", "Elemental Teachings",
    # Repeatable Treasure.
    "Smothering Tithe", "Goldspan Dragon",
    # Decisions 38-39: a cost of exactly {T} untaps a land or (another) permanent.
    "Arbor Elf", "Voyaging Satyr", "Ley Druid", "Juniper Order Druid",
    "Krosan Restorer", "Stone-Seeder Hierophant", "Blossom Dryad", "Portent Tracker",
    "Sculptor of Winter", "Kiora's Follower", "Ioreth of the Healing House",
    "Unbender Tine", "Vizier of Tumbling Sands", "Tidewater Minion", "Kelpie Guide",
    "Forensic Researcher", "North Pole Patrol", "Rime Tender",
    # Decision 35: your own mana doublers.
    "Zendikar Resurgent", "Mana Reflection", "Harrow",
)  # fmt: skip
LIGHT = (
    # Decision 31: extra land drops.
    "Growth Spiral", "Exploration", "Azusa, Lost but Seeking", "Burgeoning",
    "Oracle of Mul Daya",
    # Decision 32: one-shot mana, and one batch of Treasure.
    "Dark Ritual", "Lotus Petal", "Jeweled Lotus", "Simian Spirit Guide",
    "Dockside Extortionist", "Big Score",
    "Contested Game Ball",  # one Treasure, then it sacrifices itself
    "Stimulus Package",  # its ETB batch; "Sacrifice a Treasure: create" isn't a maker
    # Decision 34: a land fetched to hand.
    "Land Tax", "Expedition Map", "Yavimaya Elder", "Sylvan Scrying",
    "Gift of Estates", "Weathered Wayfarer", "Borderland Ranger",
    "Traverse the Ulvenwald", "Lay of the Land", "Evolution Charm", "Renegade Map",
    "Wanderer's Twig",
)  # fmt: skip
NEITHER = (
    "Command Tower", "Evolving Wilds", "Forest",
    "Bala Ged Recovery // Bala Ged Sanctuary",  # MDFC with a land face
    "An Offer You Can't Refuse",  # Treasures go to the spell's controller
    "Goblin Electromancer",  # cost reducer
    "Frantic Search", "Earthcraft",  # one-shot untap; untap without {T}
    # Decision 39: "tap or untap", or an untap whose cost is more than {T}.
    "Fatestitcher", "Captain of the Mists", "Rimewind Taskmage", "Eternal Acrobat Toast",
    "Hope Tender", "Formidable Speaker", "Rustvine Cultivator",
    "Mana Flare", "High Tide",  # symmetric (decision 35)
    # Decision 37: landcycling, spelled out or not.
    "Krosan Tusker", "Topiary Panther", "Herd Migration",
    "Academy Manufactor",  # a replacement effect, not a Treasure maker
    "Crop Rotation", "Knight of the Reliquary",  # a land swapped for one land
    "Beseech the Queen",  # "lands you control" isn't a land search
    # Firebending mana lasts only until end of combat, on tokens too.
    "Fire Nation Attacks", "Fire Nation Occupation", "Cruel Administrator",
)  # fmt: skip
for n in FULL:
    assert ramp_tier(card(n)) == "full", (n, ramp_tier(card(n)))
for n in LIGHT:
    assert ramp_tier(card(n)) == "light", (n, ramp_tier(card(n)))
for n in NEITHER:
    assert ramp_tier(card(n)) is None, (n, ramp_tier(card(n)))
# Colorless land-to-hand fetchers are back in the cube's colorless fixing slot.
for n in ("Expedition Map", "Wanderer's Twig", "Renegade Map"):
    assert classify_cube_category(card(n)) == "F", (n, classify_cube_category(card(n)))

# --- 2. deck_composition reports count (full + light) and light ------------- #
comp = mtg.deck_composition(
    "1 Sol Ring\n1 Cultivate\n1 Dark Ritual\n1 Growth Spiral\n1 Command Tower",
    fmt="commander",
)
ramp = next(c for c in comp["categories"] if c["key"] == "ramp")
assert (ramp["count"], ramp["light"]) == (4, 2), ramp

# --- 3. the prefilter is a real superset of ramp_tier ----------------------- #
pool = {
    c["name"]: c
    for c in idx.values()
    if (c.get("legalities") or {}).get("commander") == "legal"
}
t0 = time.perf_counter()
tiers = {n: ramp_tier(c) for n, c in pool.items()}
scan_s = time.perf_counter() - t0
# One pass took ~0.5s over 31,888 cards when written; ~6x that is the ceiling.
assert scan_s < 3.0, f"ramp_tier pass took {scan_s:.1f}s over {len(pool)} cards"
pre = re.compile(RAMP_PREFILTER, re.IGNORECASE)
missed = [n for n, t in tiers.items() if t and not pre.search(get_oracle_text(pool[n]))]
assert not missed, missed[:20]
assert not [n for n, t in tiers.items() if t and is_land(pool[n])]


# --- 4. the invariant: every fill candidate raises the ramp count ----------- #
def fills(ci, sort, limit):
    return mtg._fill_candidates(
        mtg._FILL_SEARCH["ramp"],
        color_identity=ci,
        fmt="commander",
        sort=sort,
        limit=limit,
    )


t0 = time.perf_counter()
fills("G", "edhrec-desc", 20)
cold_s = time.perf_counter() - t0

# Both callers' shapes: fills (popularity, 20) and budget swaps (price, 10).
for sort, limit in (("edhrec-desc", 20), ("price-asc", 10)):
    sort_key, reverse = _parse_sort(sort)
    for ci in ("G", "WU", "BR", "C"):
        cands = fills(ci, sort, limit)
        names = [c["name"] for c in cands]
        assert len(cands) == limit, (ci, sort, names)
        assert len(set(names)) == len(names), (ci, sort, names)
        lands = [c["name"] for c in cands if is_land(c)]
        assert not lands, f"ramp {ci} {sort}: lands offered: {lands}"

        # Through the real count: a deck of exactly these cards counts each one.
        text = "\n".join(f"1 {n}" for n in names)
        cat = next(
            c
            for c in mtg.deck_composition(text, fmt="commander")["categories"]
            if c["key"] == "ramp"
        )
        assert cat["count"] == len(names), (ci, sort, cat, names)
        light = [ramp_tier(c) == "light" for c in cands].count(True)
        assert cat["light"] == light, (ci, sort, cat, names)

# Tier order, over whole pools where both tiers appear (the top 20 are all full):
# no light card before a full one, and each tier in the caller's sort order.
for sort in ("edhrec-desc", "price-asc"):
    sort_key, reverse = _parse_sort(sort)
    for ci in ("G", "B", "C"):
        cands = fills(ci, sort, None)
        is_full = [ramp_tier(c) == "full" for c in cands]
        assert True in is_full and False in is_full, (ci, sort, len(cands))
        assert is_full == sorted(is_full, reverse=True), (ci, sort)
        for tier in (True, False):
            part = [c for c, f in zip(cands, is_full) if f is tier]
            assert part == sorted(part, key=sort_key, reverse=reverse), (ci, sort)

# --- 5. role tag and budget swaps use the same definition ------------------- #
for n in ("Cultivate", "Kodama's Reach", "Gilded Lotus", "Three Visits"):
    assert "Ramp" in mtg._classify_roles(card(n)), (n, mtg._classify_roles(card(n)))
assert mtg._classify_roles(card("Command Tower")) == ["Land"]
assert "Ramp" in mtg._classify_roles(card("Lay of the Land"))  # decision 34
assert "Ramp" not in mtg._classify_roles(card("Krosan Tusker"))  # decision 37

seen = []
real_fill = mtg._fill_candidates


def spy(cfg, **kw):
    seen.append(cfg)
    return real_fill(cfg, **kw)


mtg._fill_candidates = spy
try:
    swaps = mtg.budget_swaps("1 Gilded Lotus", fmt="commander", threshold=0.01)
finally:
    mtg._fill_candidates = real_fill
assert mtg._classify_roles(card("Gilded Lotus"))[0] == "Ramp"
assert seen and seen[0] is mtg._FILL_SEARCH["ramp"], seen[:1]
alt = swaps["swaps"][0]["alternative"]
assert alt["role"] == "Ramp" and ramp_tier(card(alt["name"])), alt

print(
    f"test_ramp_definition: ok (ramp_tier pass {scan_s:.2f}s over {len(pool)} "
    f"cards; cold ramp fill {cold_s:.2f}s; tiers "
    f"full={list(tiers.values()).count('full')} "
    f"light={list(tiers.values()).count('light')})"
)
