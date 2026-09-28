"""Self-check: composition fills search the same definition the count uses.
Run: python test_wipe_draw_definition.py

Uses the real bulk card index on disk. No network, no AI call: it tests the
deterministic search behind ai_composition_fills, not the Anthropic call after it.

Prod failure (audit #11): deck_composition counted board wipes with the
`board-wipe` preset while the fills searched a looser oracle regex, so the
generator could add Creeping Corrosion and friends (artifact wipes) and the deck
still read "Board wipes 0/3". Card draw had the same split.

Board wipes have two tiers: full (`board-wipe` plus `mass-bounce`) and light
(`board-wipe-light` small sweepers and activated pingers). Light cards count
fully but are reported as `light` and rank below full ones in fills.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402
from mtg_utils.card_search import _parse_sort  # noqa: E402
from mtg_utils.theme_presets import get_preset  # noqa: E402

idx = mtg._bulk_index()
COMP = {key: (full, light) for key, _, _, full, light in mtg._COMPOSITION if full}
assert COMP["board-wipe"] == (("board-wipe", "mass-bounce"), ("board-wipe-light",))
assert COMP["card-draw"] == (("card-draw", "cantrip"), ())
FULL_WIPE, LIGHT_WIPE, BOUNCE = (
    get_preset(n) for n in ("board-wipe", "board-wipe-light", "mass-bounce")
)


def card(name):
    c = idx.get(name)
    assert c, f"{name!r} not in bulk"
    return c


# --- preset fixtures hold against real cards ------------------------------- #
for name in ("board-wipe", "board-wipe-light", "mass-bounce", "card-draw", "cantrip"):
    p = get_preset(name)
    assert p.should_match and p.should_not_match, name
    for card_name in p.should_match:
        assert p.matches(card(card_name)), f"{name} should match {card_name}"
    for card_name in p.should_not_match:
        assert not p.matches(card(card_name)), f"{name} should not match {card_name}"

# --- precision: the tiers Andres set ---------------------------------------- #
# Neither tier: combat-only, drawbacks/incidental, static anthems, repeatable
# triggers (Holiday's review of a82265f).
NEITHER = (
    "Rain of Blades", "Sandstorm", "Marrow Shards", "Scorching Winds", "Lava Storm",
    "Leonin Bladetrap", "Choking Fumes", "Hail Storm", "Warpath",
    "Goblin Swine-Rider", "Kusari-Gama", "Coils of the Medusa",
    "Goblin Shrine", "Scorch the Fields", "Floodgate", "Electric Seaweed",
    "Lockjaw Snapper", "Rolling Spoil",
    "Crovax, Ascendant Hero", "Ascendant Evincar", "Kaervek, the Spiteful",
    "Ethereal Absolution", "M.O.D.O.K.", "The Flesh Is Weak",
    "Archfiend of Ifnir", "Doomwake Giant", "Bolg, Erebor's Reckoning",
    "Noxious Ghoul", "Festercreep", "Plague Dogs", "Death's-Head Buzzard",
    # Holiday's review of 3abe387, and combat-only bounce.
    "Cathedral Membrane", "Eye of Doom", "Volatile Rig", "Mishra, Lost to Phyrexia",
    "Aetherize", "Trial // Error",
)  # fmt: skip
FULL = (
    "Toxic Deluge", "Black Sun's Zenith", "Crux of Fate", "The Meathook Massacre",
    "Damn", "Mizzium Mortars", "Winds of Abandon", "Oblivion Stone",
    "Ugin, the Spirit Dragon", "Engineered Explosives", "All Is Dust", "Scourglass",
    "Terminus", "Living Death", "Living End", "The Eternal Wanderer",
    "Bringer of the Last Gift", "Tragic Arrogance",
    # Death-trigger wipes stay full.
    "Havoc Demon", "Child of Alara", "False Prophet", "Nevinyrral, Urborg Tyrant",
    "Piru, the Volatile", "Ryusei, the Falling Star", "Elvish Dreadlord",
    "Magma Phoenix", "Bearer of the Heavens",
)  # fmt: skip
LIGHT_SWEEPERS = (
    "Cower in Fear", "Festergloom", "Nausea", "Shrivel",
    "Seismic Wave", "Radiating Lightning", "Chandra's Fury",
    # Repeatable activated pingers.
    "Pestilence", "Pyrohemia", "Pestilence Demon", "Thrashing Wumpus",
    "Withering Wisps",
)  # fmt: skip
for n in NEITHER:
    hit = [p.name for p in (FULL_WIPE, LIGHT_WIPE, BOUNCE) if p.matches(card(n))]
    assert not hit, f"{n} should be in neither tier, matched {hit}"
for n in FULL:
    assert FULL_WIPE.matches(card(n)), f"{n} should be a full board wipe"
for n in LIGHT_SWEEPERS:
    assert LIGHT_WIPE.matches(card(n)), f"{n} should be a light board wipe"
    assert not FULL_WIPE.matches(card(n)), f"{n} should not be a full board wipe"
for n in ("Evacuation", "Cyclonic Rift"):
    assert BOUNCE.matches(card(n)), n  # full tier via mass-bounce
    # ...but not the `board-wipe` preset itself: the aristocrats "mass death"
    # avenue reads that one, and bounce kills nothing.
    assert not FULL_WIPE.matches(card(n)), n
for n in ("Unsummon", "Boomerang", "Capsize"):
    assert not BOUNCE.matches(card(n)), n

# --- deck_composition reports count (full + light) and light ---------------- #
comp = mtg.deck_composition(
    "1 Damnation\n1 Cower in Fear\n1 Evacuation\n1 Llanowar Elves\n1 Forest",
    fmt="commander",
)
cats = {c["key"]: c for c in comp["categories"]}
assert (cats["board-wipe"]["count"], cats["board-wipe"]["light"]) == (3, 1), cats
assert all(isinstance(c["light"], int) for c in cats.values()), cats
assert all(c["light"] == 0 for k, c in cats.items() if k != "board-wipe"), cats


# --- the invariant: every fill candidate raises the count ------------------ #
def fills(key, ci, sort="edhrec-desc", limit=20):
    return mtg._fill_candidates(
        mtg._FILL_SEARCH[key],
        color_identity=ci,
        fmt="commander",
        sort=sort,
        limit=limit,
    )


# Both callers' shapes: fills (popularity, 20) and budget swaps (price, 10).
for sort, limit in (("edhrec-desc", 20), ("price-asc", 10)):
    sort_key, reverse = _parse_sort(sort)
    for key in ("board-wipe", "card-draw"):
        full = [get_preset(p) for p in COMP[key][0]]
        light = [get_preset(p) for p in COMP[key][1]]
        for ci in ("B", "U", "W", "WB"):
            cands = fills(key, ci, sort, limit)
            names = [c["name"] for c in cands]
            assert cands, (key, ci, sort)

            not_counted = [
                c["name"] for c in cands if not any(m.matches(c) for m in full + light)
            ]
            assert not not_counted, f"{key} {ci} {sort}: {not_counted} don't count"

            assert len(cands) <= limit, (key, ci, sort, len(cands))
            assert len(set(names)) == len(names), (key, ci, sort, names)

            # Tier ordering: no light card before a full one; each tier sorted.
            is_full = [any(m.matches(c) for m in full) for c in cands]
            assert is_full == sorted(is_full, reverse=True), (key, ci, sort, names)
            for tier in (True, False):
                part = [c for c, f in zip(cands, is_full) if f is tier]
                assert part == sorted(part, key=sort_key, reverse=reverse), names

            # The same thing through the real count: a deck of exactly these
            # cards counts every one of them, and the light ones as light.
            text = "\n".join(f"1 {n}" for n in names)
            cat = next(
                c
                for c in mtg.deck_composition(text, fmt="commander")["categories"]
                if c["key"] == key
            )
            assert cat["count"] == len(names), (key, ci, sort, cat["count"], names)
            assert cat["light"] == is_full.count(False), (key, ci, sort, cat, names)

# Mass bounce is full tier, so blue's fills reach it.
u_wipes = [c["name"] for c in fills("board-wipe", "U")]
assert {"Cyclonic Rift", "Evacuation"} <= set(u_wipes), u_wipes

# --- the OR helper and search_cards' OR mode -------------------------------- #
draw, cantrip = get_preset("card-draw"), get_preset("cantrip")
cands = fills("card-draw", "U")
only_cantrip = [c["name"] for c in cands if cantrip.matches(c) and not draw.matches(c)]
only_draw = [c["name"] for c in cands if draw.matches(c) and not cantrip.matches(c)]
assert only_cantrip, [c["name"] for c in cands]
assert only_draw, [c["name"] for c in cands]


def names_of(**kw):
    found = mtg._search_cards(
        config.BULK_PATH, color_identity="U", format="commander", limit=None, **kw
    )
    return {c["name"] for c in found}


either = names_of(any_preset_names=("card-draw", "cantrip"))
assert either == names_of(preset_names=("card-draw",)) | names_of(
    preset_names=("cantrip",)
)
# preset_names still ANDs.
both = names_of(preset_names=("card-draw", "cantrip"))
assert both < either and not both & set(only_cantrip + only_draw)

# Budget swaps: "Board wipe" resolves to the board-wipe fill entry, and the role
# classifier agrees with the count on both tiers.
first = next(k for k, lbl in mtg._ROLE_CHECKS if lbl == "Board wipe")
assert first == "board-wipe", first
for n in ("Damnation", "Cower in Fear", "Evacuation"):
    assert "Board wipe" in mtg._classify_roles(card(n)), n
assert "Board wipe" not in mtg._classify_roles(card("Rain of Blades"))

print("test_wipe_draw_definition: ok")
