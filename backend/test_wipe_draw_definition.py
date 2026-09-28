"""Self-check: composition fills search the same definition the count uses.
Run: python test_wipe_draw_definition.py

Uses the real bulk card index on disk. No network, no AI call: it tests the
deterministic search behind ai_composition_fills, not the Anthropic call after it.

Prod failure (audit #11): deck_composition counted board wipes with the
`board-wipe` preset while the fills searched a looser oracle regex, so the
generator could add Creeping Corrosion and friends (artifact wipes) and the deck
still read "Board wipes 0/3". Card draw had the same split.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from app import mtg  # noqa: E402
from mtg_utils.card_search import _parse_sort  # noqa: E402
from mtg_utils.theme_presets import get_preset  # noqa: E402

idx = mtg._bulk_index()
COMP = {key: presets for key, _, _, presets in mtg._COMPOSITION if presets}
assert COMP["board-wipe"] == ("board-wipe", "mass-bounce"), COMP["board-wipe"]

# --- preset fixtures hold against real cards ------------------------------- #
for name in ("board-wipe", "mass-bounce", "card-draw", "cantrip"):
    p = get_preset(name)
    assert p.should_match and p.should_not_match, name
    for card_name in p.should_match:
        card = idx.get(card_name)
        assert card, f"{name}: fixture {card_name!r} not in bulk"
        assert p.matches(card), f"{name} should match {card_name}"
    for card_name in p.should_not_match:
        card = idx.get(card_name)
        assert card, f"{name}: fixture {card_name!r} not in bulk"
        assert not p.matches(card), f"{name} should not match {card_name}"

# Mass bounce is a board wipe for the count, not for `board-wipe` itself (the
# aristocrats "mass death" avenue reads that one; bounce kills nothing).
for card_name in ("Evacuation", "Cyclonic Rift"):
    assert not get_preset("board-wipe").matches(idx[card_name]), card_name
for card_name in ("Unsummon", "Boomerang", "Capsize"):
    assert not get_preset("mass-bounce").matches(idx[card_name]), card_name


# --- the invariant: every fill candidate raises the count ------------------ #
def fills(key, ci, sort="edhrec-desc", limit=20):
    return mtg._fill_candidates(
        mtg._FILL_SEARCH[key],
        color_identity=ci,
        fmt="commander",
        sort=sort,
        limit=limit,
    )


def label(key):
    return next(lbl for k, lbl, _, _ in mtg._COMPOSITION if k == key)


# Both callers' shapes: fills (popularity, 20) and budget swaps (price, 10).
for sort, limit in (("edhrec-desc", 20), ("price-asc", 10)):
    for key in ("board-wipe", "card-draw"):
        matchers = [get_preset(p) for p in COMP[key]]
        for ci in ("B", "U", "WB"):
            cands = fills(key, ci, sort, limit)
            names = [c["name"] for c in cands]
            assert cands, (key, ci, sort)
            assert len(cands) <= limit, (key, ci, sort, len(cands))
            assert len(set(names)) == len(names), (key, ci, sort, names)
            sort_key, reverse = _parse_sort(sort)
            assert cands == sorted(cands, key=sort_key, reverse=reverse), names

            not_counted = [
                c["name"] for c in cands if not any(m.matches(c) for m in matchers)
            ]
            assert not not_counted, f"{key} {ci} {sort}: {not_counted} don't count"

            # The same thing through the real count: a deck of exactly these
            # cards counts every one of them in this category.
            text = "\n".join(f"1 {n}" for n in names)
            comp = mtg.deck_composition(text, fmt="commander")
            cat = next(c for c in comp["categories"] if c["key"] == key)
            assert cat["count"] == len(names), (key, ci, sort, cat["count"], names)
            assert cat["label"] == label(key)

# Mass bounce reaches the board-wipe fills (blue's best wipe is a bounce).
assert "Cyclonic Rift" in [c["name"] for c in fills("board-wipe", "U")]

# --- the OR helper: either preset is enough -------------------------------- #
draw, cantrip = get_preset("card-draw"), get_preset("cantrip")
cands = fills("card-draw", "U")
only_cantrip = [c["name"] for c in cands if cantrip.matches(c) and not draw.matches(c)]
only_draw = [c["name"] for c in cands if draw.matches(c) and not cantrip.matches(c)]
assert only_cantrip, [c["name"] for c in cands]
assert only_draw, [c["name"] for c in cands]
# search_cards itself ANDs presets, which is why the helper exists.
anded = mtg._search_cards(
    config.BULK_PATH,
    preset_names=("card-draw", "cantrip"),
    color_identity="U",
    format="commander",
    limit=50,
)
assert all(draw.matches(c) and cantrip.matches(c) for c in anded)
assert not {c["name"] for c in anded} & set(only_cantrip + only_draw)

# Budget swaps: "Board wipe" resolves to the board-wipe fill entry.
first = next(k for k, lbl in mtg._ROLE_CHECKS if lbl == "Board wipe")
assert first == "board-wipe", first
assert "Board wipe" in mtg._classify_roles(idx["Evacuation"])

print("test_wipe_draw_definition: ok")
