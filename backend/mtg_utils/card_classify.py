"""Shared card classification helpers for hydrated card dicts."""

from __future__ import annotations

import re
from collections.abc import Sequence

from mtg_utils._name_index import NameIndex, build_name_index
from mtg_utils.format_config import FORMAT_CONFIGS

SKIP_LAYOUTS = frozenset(
    # token / art_series / reversible_card are non-gameplay or cosmetic-reprint
    # printings. "reversible_card" is the Secret Lair novelty layout (e.g. Krark,
    # the Thumbless // Krark, the Thumbless): legally single-faced, with a null
    # top-level cmc/type_line, and always backed by a canonical printing — so it
    # would otherwise show up as a duplicate, mis-parsed search entry.
    ("token", "double_faced_token", "art_series", "reversible_card")
)


# Singleton-rule exemption patterns.
#
# Standard MTG deck-building rules cap non-basic cards at 4 copies (or 1 in
# singleton formats like Commander/Brawl). Some cards opt out via oracle
# text: "A deck can have any number of cards named X" (Relentless Rats,
# Persistent Petitioners, Hare Apparent, Shadowborn Apostle, Rat Colony,
# Dragon's Approach) or "A deck can have up to N cards named X" (Seven
# Dwarves, Nazgul). These cards break two assumptions:
#
#   1. Singleton legality (handled by legality_audit).
#   2. The Arena 4-cap rule: Arena normally treats ownership of 4 copies
#      of a card as "infinite" for deck-building purposes (you can never
#      need a 5th in a legal deck), but this substitution does NOT apply
#      to cards with an oracle exemption — you can legitimately want 17
#      Hare Apparent and Arena will charge wildcards for the 13 you don't
#      own. price_check uses ``has_copy_limit_exemption`` to gate the
#      4-cap substitution.
_ANY_NUMBER_PATTERN = "A deck can have any number of cards named"
_UP_TO_N_PATTERN = re.compile(
    r"A deck can have up to (\w+) cards named",
    re.IGNORECASE,
)
_WORD_TO_INT = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


def get_oracle_text(card: dict) -> str:
    """Get oracle text, falling back to joined card_faces for MDFCs/split cards."""
    oracle = card.get("oracle_text") or ""
    if not oracle:
        faces = card.get("card_faces", [])
        oracle = "\n// \n".join(
            f.get("oracle_text", "") for f in faces if f.get("oracle_text")
        )
    return oracle


def extract_price(card: dict | None) -> float | None:
    """Extract USD price from a card dict, preferring usd over usd_foil."""
    if card is None:
        return None
    prices = card.get("prices") or {}
    usd = prices.get("usd")
    if usd is not None:
        return float(usd)
    usd_foil = prices.get("usd_foil")
    if usd_foil is not None:
        return float(usd_foil)
    return None


def build_card_lookup(hydrated: Sequence[dict | None]) -> NameIndex:
    """Build a folding name -> card index from a hydrated (resolved-records) list.

    The keying — NFKD folding, every-face DFC aliases, Arena printed_name / flavor_name
    — is the shared ``_name_index`` core, so a deck author's spelling resolves to the
    canonical record regardless of case, diacritics ("Lim-Dul's Vault"), or which face
    they typed ("Hengegate Pathway"). Hydration already picked one record per name, so
    there's nothing to dedup (first-seen) and no prefilter. The returned ``NameIndex``
    folds the query on ``.get`` / ``in`` the same way the keys were folded — without
    that, a miss silently drops the card from every downstream count (lands, CMC,
    colors, legality).
    """
    return build_name_index(hydrated)


def color_identity_subset(card_identity: list[str], allowed: set[str]) -> bool:
    """Check whether a card's color identity is a subset of the allowed colors."""
    return set(card_identity).issubset(allowed)


def _classifying_type_line(card: dict) -> str:
    """The type line to classify a card by. A transform/flip card enters as its FRONT
    face, so use that face's type — the back (e.g. a Saga that transforms into a Land or
    Creature) only appears conditionally and must not count for deckbuilding. Modal DFCs
    (either face is playable) and single-faced cards use the full type line."""
    if card.get("layout") in ("transform", "flip"):
        faces = card.get("card_faces")
        if faces:
            return faces[0].get("type_line", "") or card.get("type_line", "")
    return card.get("type_line", "")


def is_land(card: dict) -> bool:
    """Check if the card's (front-face) type line contains 'Land'."""
    return "Land" in _classifying_type_line(card)


def is_creature(card: dict) -> bool:
    """Check if the card's (front-face) type line contains 'Creature'."""
    return "Creature" in _classifying_type_line(card)


# Reminder text (always parenthetical) describes a TOKEN's ability, not the card's own
# — so a counterspell that hands an opponent Treasures carries "(… Add one mana …)" even
# though it produces no mana for you.
_REMINDER_RE = re.compile(r"\([^)]*\)")
# Mana YOU get: "Add {G}", "Add one/two/X mana", "Add an amount of {G}" (Karametra's
# Acolyte), "add mana of that color"; an Aura on your land ("Whenever enchanted land is
# tapped for mana, its controller adds…", Utopia Sprawl); and "target player adds"
# (Spectral Searchlight), since you can pick yourself. "That player adds" after "a
# player taps" (Mana Flare), "each player adds" and "its controller may add" on every
# Island (Snowfall) are symmetric: not ramp. Your own
# mana doublers count as mana too: "add an additional {G}" (Leyline of Abundance),
# "produces twice as much" (Mana Reflection, Nyxbloom Ancient), Doubling Cube.
_ADD_MANA_RE = re.compile(
    r"(?<!controller may )\badd\s+(?:an additional\s+)?(?:\{|(?:one|two|three|four"
    r"|five|six|seven|eight|nine|ten|x|that much|an amount of)\s+(?:\{|mana\b)|mana of)"
    r"|whenever enchanted [^.]*its controller adds"
    r"|(?:target player|a player of your choice|choose a player\. that player) adds"
    r"|produces (?:twice|three times) as much|double the amount of each type of unspent"
)
_LAND_WORD = (
    r"\b(?:lands?|plains|islands?|swamps?|mountains?|forests?|caves?|deserts?|gates?)\b"
)
# A land from your library onto the battlefield: Rampant Growth, Cultivate, Three
# Visits ("a Forest card"), Farseek, Elemental Teachings (two sentences later). "search
# their library" (Path to Exile) isn't yours.
_LAND_TO_BATTLEFIELD_RE = re.compile(
    rf"search your library for [^.]*?{_LAND_WORD}[^.]*(?:\.[^.]*){{0,2}}?"
    r"onto the battlefield"
)
# Sacrificing a land to fetch ONE land is a swap, not ramp (Crop Rotation, Knight of
# the Reliquary); fetching two for one (Harrow) still is. Only a sacrifice paid for
# the fetch counts: in its cost, or as the spell's additional cost (not Alpine Guide's
# "when it leaves, sacrifice a Mountain").
_LAND_SWAP_RE = re.compile(
    rf'^[^:"]*sacrifice an? (?:untapped )?{_LAND_WORD}[^:"]*:'
    rf"|as an additional cost[^.]*sacrifice an? {_LAND_WORD}",
    re.MULTILINE,
)
# A land fetched to your hand is light ramp (decision 34: Land Tax, Expedition Map,
# Borderland Ranger). The search must be FOR a land card ("a basic land card", "a
# Forest card"), so Beseech the Queen's "number of lands you control" doesn't count.
_LAND_TO_HAND_RE = re.compile(
    r"search your library for [^.]*?\b(?:land|plains|island|swamp|mountain|forest|cave"
    r"|desert|gate)s? cards?\b[^.]*(?:\.[^.]*){0,2}?into your hand"
)
# Landcycling is not ramp (decision 37): the keyword's fetch is reminder text, and the
# cards that spell it out fetch as a cycle trigger (Krosan Tusker) or by discarding
# themselves (Herd Migration, channel).
_CYCLE_FETCH_RE = re.compile(r'^(?:when you cycle|[^:"]*\bdiscard this card\b[^:"]*:)')
# A {T} untap of a land (or any permanent) is a repeatable mana source (decision 38:
# Arbor Elf, Voyaging Satyr, Kiora's Follower). One-shot untaps (Frantic Search) and
# untaps without {T} (Earthcraft) don't count.
_UNTAP_LAND_RE = re.compile(
    r"\buntap (?:another )?target (?:basic |snow )?"
    r"(?:land|forest|plains|island|swamp|mountain|permanent)\b"
)
# A token YOU create that makes mana, or fetches a land (a Lander is a Wayfarer's
# Bauble). "Creates" and "they create" are someone else's (An Offer You Can't Refuse:
# "Its controller creates two Treasure tokens"; Pain Distributor), and a line with "if
# you would create" is a replacement effect (Academy Manufactor), not a maker. The
# token's own "Add" is reminder text, so it's matched by a name AFTER "create" (not
# Stimulus Package's "Sacrifice a Treasure: Create a Citizen"), or by an Add inside the
# line's reminder, except firebending's combat-only mana.
_YOU_CREATE_RE = re.compile(r"^(?!.*\bwould create\b).*?(?<!they )\bcreate\b")
# A maker that sacrifices itself as it creates (Contested Game Ball) makes one batch.
_SACRIFICE_SELF_RE = re.compile(r"\bsacrifice (?:it|this \w+)\b")
_QUOTED_RE = re.compile(r'"[^"]*"')
_MANA_TOKEN_RE = re.compile(r"\b(?:treasure|gold|powerstone|vibranium)\b")
_LAND_TOKEN_RE = re.compile(r"\blander\b")
# Extra land drops (decision 31): Exploration, Azusa, Growth Spiral, Burgeoning.
# "Each player may play an additional land" (Rites of Flourishing) is symmetric.
_EXTRA_LAND_RE = re.compile(
    r"(?<!each player may play )(?:an|two|three|x|\bup to \w+) additional lands?\b"
    r"|land cards? from your hand onto the battlefield"
)
# One-shot triggers: "When … enters, add {B}{B}{B}" (after an optional ability word,
# unless it also fires "at the beginning of" each upkeep) and Saga chapters.
_ONE_SHOT_RE = re.compile(
    r"^(?:(?:[^—:]*—\s*)?when\b(?![^,]*at the beginning)|[ivx]+(?:, [ivx]+)* —)"
)
# A line that continues the one above it: a modal bullet or a die-roll result row.
_CONTINUATION_RE = re.compile(r"^(?:•|\d+(?:—\d+)? \|)")
# An activated ability's cost: the text before its colon, unless a quote comes first
# (then the colon belongs to an ability granted to something else).
_COST_RE = re.compile(r'^([^:"]*):')


def _ramp_face_tier(name: str, type_line: str, text: str) -> str | None:
    spell = "Instant" in type_line or "Sorcery" in type_line
    text = text.lower()
    swap = _LAND_SWAP_RE.search(_REMINDER_RE.sub("", text))
    tier = None
    head = ""
    for raw in text.split("\n"):
        line = _REMINDER_RE.sub("", raw).strip()
        if not _CONTINUATION_RE.match(line):
            head = line
        fetch = _LAND_TO_BATTLEFIELD_RE.search(line)
        if fetch and not (swap and re.match(r"search your library for an? ", fetch[0])):
            return "full"
        you_create = _YOU_CREATE_RE.search(line)
        after = line[you_create.end() :] if you_create else ""
        if you_create and (
            _LAND_TOKEN_RE.search(after) or _LAND_TO_BATTLEFIELD_RE.search(raw)
        ):
            return "full"
        cost = _COST_RE.match(line)
        untap = cost and "{t}" in cost[1] and _UNTAP_LAND_RE.search(line, cost.end())
        token = you_create and (
            _MANA_TOKEN_RE.search(after)
            or ("firebending" not in line and _ADD_MANA_RE.search(raw))
        )
        if _ADD_MANA_RE.search(line) or untap or token:
            one_shot = spell or _ONE_SHOT_RE.match(head) or _self_cost(name, head)
            if token and _SACRIFICE_SELF_RE.search(_QUOTED_RE.sub("", line)):
                one_shot = True
            if not one_shot:
                return "full"
            tier = "light"
        elif _EXTRA_LAND_RE.search(line) or (
            _LAND_TO_HAND_RE.search(line) and not _CYCLE_FETCH_RE.match(head)
        ):
            tier = "light"
    return tier


def _self_cost(name: str, line: str) -> bool:
    """True if the line's activation cost sacrifices, exiles or discards the card
    itself (Lotus Petal, Simian Spirit Guide): mana it makes only once."""
    cost = _COST_RE.match(line)
    if not cost:
        return False
    names = {name.lower(), name.split(",")[0].lower(), "this"}
    return any(
        f"{verb} {n}" in cost.group(1)
        for verb in ("sacrifice", "exile", "discard")
        for n in names
    )


def ramp_tier(card: dict) -> str | None:
    """Ramp tier of a card: "full", "light" or None (decisions 30-32, 34-38).

    Full: repeatable mana (rocks, dorks, land-untapping dorks, land Auras, your own
    mana doublers, repeatable Treasure makers) or a land from your library onto the
    battlefield. Light: extra land drops, a land fetched to your hand (not
    landcycling) and one-shot mana (rituals, self-sacrificing rocks, a single batch of
    Treasure). Lands, MDFCs
    with a land face included, are never ramp. A face that is a land (the back of a
    transforming card) doesn't count either.
    """
    if is_land(card):
        return None
    faces = [
        f for f in card.get("card_faces") or [] if "Land" not in f.get("type_line", "")
    ] or [card]
    tiers = {
        _ramp_face_tier(
            f.get("name", ""), f.get("type_line", ""), f.get("oracle_text") or ""
        )
        for f in faces
    }
    return "full" if "full" in tiers else "light" if "light" in tiers else None


def is_ramp(card: dict) -> bool:
    """Check if a non-land card is ramp of either tier (see ``ramp_tier``)."""
    return ramp_tier(card) is not None


# Cheap oracle-text prefilter for searching ramp: every card ``ramp_tier`` accepts
# matches it (a superset, asserted over the whole pool by test_ramp_definition.py), so
# a search can scan with this regex and run ``ramp_tier`` on the survivors only.
RAMP_PREFILTER = (
    r"\badd|search your library|treasure|gold|powerstone|vibranium|lander"
    r"|from your hand onto the battlefield|as much|double the amount|untap"
)


# Pattern to find explicit mana symbols in "Add {X}" patterns
_ADD_MANA_PATTERN = re.compile(r"[Aa]dd\s+(\{[^}]+\}(?:\s*(?:or\s+)?\{[^}]+\})*)")
_MANA_SYMBOL_PATTERN = re.compile(r"\{([WUBRGC])\}")

_FETCH_ANY_BASIC_PATTERN = re.compile(r"[Ss]earch your library for a basic land card")
_FETCH_BASIC_LAND_PATTERN = re.compile(
    r"[Ss]earch your library for (?:a |an )?(?:basic )?"
    r"((?:Plains|Island|Swamp|Mountain|Forest)"
    r"(?:(?:,|,? or) (?:Plains|Island|Swamp|Mountain|Forest))*)"
    r"(?: card| land)"
)

_BASIC_LAND_TYPES: dict[str, str] = {
    "Plains": "W",
    "Island": "U",
    "Swamp": "B",
    "Mountain": "R",
    "Forest": "G",
}


def color_sources(card: dict) -> set[str]:
    """Parse which colors of mana a card can produce."""
    oracle = get_oracle_text(card)
    type_line = card.get("type_line", "") or ""
    colors: set[str] = set()

    # Check for "any color" first
    if re.search(r"[Aa]dd.*\bany color\b", oracle):
        return {"any"}

    # Check for "basic land card" fetch (any color)
    if _FETCH_ANY_BASIC_PATTERN.search(oracle):
        return {"any"}

    # Check for specific land type fetches
    for match in _FETCH_BASIC_LAND_PATTERN.finditer(oracle):
        types_text = match.group(1)
        for land_type, color in _BASIC_LAND_TYPES.items():
            if land_type in types_text:
                colors.add(color)

    # Check explicit Add {X} patterns
    for match in _ADD_MANA_PATTERN.finditer(oracle):
        symbols_text = match.group(1)
        for sym_match in _MANA_SYMBOL_PATTERN.finditer(symbols_text):
            colors.add(sym_match.group(1))

    # Check basic land types in type_line
    for land_type, color in _BASIC_LAND_TYPES.items():
        if land_type in type_line:
            colors.add(color)

    if not colors:
        return set()

    # If only colorless symbols found, return {C}
    if colors == {"C"}:
        return {"C"}

    # Remove C if we also found real colors
    colors.discard("C")
    return colors


def is_commander(card: dict, format: str = "commander") -> dict:  # noqa: A002
    """Check if a card is eligible to be a commander in the given format.

    Returns {"eligible": bool, "requires_partner": bool}.
    """
    type_line = card.get("type_line", "")
    oracle = get_oracle_text(card).lower()

    if "Legendary" not in type_line:
        return {"eligible": False, "requires_partner": False}

    # Format legality, keyed to the right field per format (commander→"commander",
    # brawl→"standardbrawl", historic_brawl→"brawl"). Only gate when legality data is
    # present, so type-line-only fixtures keep working; mirrors find_commanders.
    legalities = card.get("legalities")
    if legalities is not None:
        legality_key = FORMAT_CONFIGS.get(format, {}).get("legality_key", format)
        if legalities.get(legality_key) not in ("legal", "restricted"):
            return {"eligible": False, "requires_partner": False}

    # Legendary Creature — always eligible
    # Check "choose a background" before returning, since those creatures
    # support (but don't require) a Background partner.
    if "Creature" in type_line:
        requires_partner = "choose a background" in oracle
        return {"eligible": True, "requires_partner": requires_partner}

    # Legendary Vehicle — always eligible
    if "Vehicle" in type_line:
        return {"eligible": True, "requires_partner": False}

    # Legendary Spacecraft with P/T — always eligible
    if "Spacecraft" in type_line and card.get("power") and card.get("toughness"):
        return {"eligible": True, "requires_partner": False}

    # Brawl formats: Legendary Planeswalker — eligible
    if format in ("brawl", "historic_brawl") and "Planeswalker" in type_line:
        return {"eligible": True, "requires_partner": False}

    # "can be your commander" oracle text — eligible
    if "can be your commander" in oracle:
        return {"eligible": True, "requires_partner": False}

    # "Choose a Background" — eligible but needs Background partner
    if "choose a background" in oracle:
        return {"eligible": True, "requires_partner": True}

    # Legendary Background enchantment — eligible only as partner
    if "Background" in type_line and "Enchantment" in type_line:
        return {"eligible": True, "requires_partner": True}

    return {"eligible": False, "requires_partner": False}


# Partner pairing (CR 702.124). Each variant pairs only within its own kind, and the
# variants can't be mixed (702.124f). `kind` ∈ {plain, group, with, choose_background,
# background, doctors_companion, doctor} or None; `value` is the group name (group) or
# the named partner (with).
_PARTNER_WITH_RE = re.compile(r"partner with ([^.\n(]+)", re.IGNORECASE)
# Separator may be em-dash, en-dash, or hyphen (\u escapes keep the source ASCII).
_PARTNER_SEP = "[\u2014\u2013-]"  # em-dash, en-dash, or hyphen
_PARTNER_GROUP_RE = re.compile(rf"partner\s*{_PARTNER_SEP}\s*([^.\n(]+)", re.IGNORECASE)


def partner_ability(card: dict) -> dict:
    """Classify a card's partner-style ability for second-commander pairing.

    Order matters: the specific variants (choose-a-Background, partner-with,
    partner—[group], Doctor's companion) are checked before plain ``partner``, because
    a "partner with [name]" card also carries the bare ``partner`` keyword (CR 702.124j)
    but pairs ONLY with its named partner, not with arbitrary partners (702.124f)."""
    type_line = card.get("type_line", "") or ""
    oracle = get_oracle_text(card)
    low = oracle.lower()

    if "choose a background" in low:
        return {"kind": "choose_background", "value": ""}
    if "Background" in type_line:
        return {"kind": "background", "value": ""}
    m = _PARTNER_WITH_RE.search(oracle)
    if m:
        return {"kind": "with", "value": m.group(1).strip().rstrip(",")}
    m = _PARTNER_GROUP_RE.search(oracle)
    if m:
        return {"kind": "group", "value": m.group(1).strip()}
    if "doctor's companion" in low:
        return {"kind": "doctors_companion", "value": ""}
    if "Time Lord Doctor" in type_line:
        return {"kind": "doctor", "value": ""}
    if re.search(r"\bpartner\b", low):
        return {"kind": "plain", "value": ""}
    return {"kind": None, "value": ""}


def valid_partner_search(card: dict) -> dict | None:
    """``card_search`` filter that finds the cards legally eligible to be ``card``'s
    paired second commander (CR 702.124), or ``None`` if it has no partner ability.

    Color-agnostic on purpose: partner legality has no color-identity restriction — the
    pair's identity is the union of the two (702.124c) — so we pass ``color_identity``
    "WUBRG" (every identity is a subset) to disable the color filter rather than wrongly
    hide an off-color legal partner (e.g. a "partner with [name]" target in a new
    color).
    """
    pa = partner_ability(card)
    kind = pa["kind"]
    base = {"color_identity": "WUBRG"}
    if kind == "choose_background":
        return {**base, "card_type": "Background"}
    if kind == "background":
        return {**base, "oracle": r"choose a background"}
    if kind == "with":
        return {**base, "name": pa["value"]}
    if kind == "group":
        grp = re.escape(pa["value"])
        return {**base, "oracle": rf"partner\s*{_PARTNER_SEP}\s*{grp}"}
    if kind == "doctors_companion":
        return {**base, "card_type": "Time Lord Doctor"}
    if kind == "doctor":
        return {**base, "oracle": r"doctor's companion"}
    if kind == "plain":
        return {**base, "oracle": r"partner \(you can have two commanders"}
    return None


def has_any_number_exemption(card: dict) -> bool:
    """True if oracle text reads "A deck can have any number of cards named X".

    Narrower than ``has_copy_limit_exemption``: returns False for the
    "up to N" variant, which still has a numeric cap. Used by
    ``legality_audit.check_singletons`` to short-circuit the cap check
    for unlimited cards.
    """
    return _ANY_NUMBER_PATTERN in get_oracle_text(card)


def named_card_cap(card: dict) -> int | None:
    """Return the integer cap from "A deck can have up to N cards named X".

    Returns None if the card has no such clause. Used by the singleton
    legality audit to permit up-to-N duplicates (e.g. 7 Seven Dwarves).
    """
    oracle = get_oracle_text(card)
    match = _UP_TO_N_PATTERN.search(oracle)
    if match is None:
        return None
    return _WORD_TO_INT.get(match.group(1).lower())


def has_copy_limit_exemption(card: dict) -> bool:
    """True if the card's oracle text lets a deck run more than 4 copies.

    Returns True for cards with either:
      - "A deck can have any number of cards named X" (unlimited)
      - "A deck can have up to N cards named X" (capped at N, but
        still exempts the card from the standard 4-copy limit)

    Used by ``price_check`` to suppress the Arena 4-cap substitution
    rule. Arena normally treats ownership of 4 copies of a playset-
    capped card as "infinite" because no legal deck can need a 5th —
    but for exempt cards, a deck can legitimately want 17 copies, so
    owning 4 does not grant the remaining 13.
    """
    oracle = get_oracle_text(card)
    if _ANY_NUMBER_PATTERN in oracle:
        return True
    return _UP_TO_N_PATTERN.search(oracle) is not None


_LAND_PRODUCES_MANA = re.compile(
    r"[Aa]dd\s+(?:\{[WUBRGC]|one mana|an? amount|X\s+mana|that much|mana of)",
    re.IGNORECASE,
)


def is_fixing_land(card: dict) -> bool:
    """True if a land counts toward the "fixing density" metric.

    This is the BROAD Lucky Paper definition used in ``cube-balance``'s
    fixing density check — it counts any land that helps a drafter cast
    multi-color spells:

    * Multi-color mana producers: duals (Overgrown Tomb), triomes, Command
      Tower, Exotic Orchard.
    * Any-color producers: City of Brass, Mana Confluence.
    * Land-fetchers that don't tap for mana: Evolving Wilds, Fabled Passage,
      fetchlands (Polluted Delta, Flooded Strand, etc.).

    Mono-color basic-producing lands and mono-color taplands are NOT fixing.

    Distinct from ``classify_cube_category`` which uses cube-utils' pack-
    template semantics (multi-color duals fill the L slot; only mana rocks
    and non-mana lands fill the F slot). Lucky Paper's published fixing
    numbers (17-28% at 360) measure the broader definition here.
    """
    if not is_land(card):
        return False
    sources = color_sources(card)
    if "any" in sources or len(sources) >= 2:
        return True
    # Lands that fetch lands without tapping for mana themselves
    # (Evolving Wilds, fetchlands). ``is_ramp`` early-returns for lands,
    # so we detect this by checking the oracle text directly.
    oracle = get_oracle_text(card).lower()
    return (
        "search your library for" in oracle
        and "land" in oracle
        and not _LAND_PRODUCES_MANA.search(get_oracle_text(card))
    )


def _land_produces_mana_directly(card: dict) -> bool:
    """True if a land has an explicit ``Add <mana>`` oracle clause.

    Distinguishes mana-producing lands (duals, Command Tower, Underground
    Sea, Karakas) from lands that only fetch other lands without tapping
    for mana (Evolving Wilds, Fabled Passage, Prismatic Vista, all fetch
    lands). A basic land's oracle text is empty — but basic lands produce
    mana by virtue of their type line, so callers short-circuit the basic
    case themselves.
    """
    oracle = get_oracle_text(card)
    if _LAND_PRODUCES_MANA.search(oracle):
        return True
    # Basic lands have empty oracle text; their type_line carries the mana
    # ability implicitly.
    type_line = card.get("type_line", "") or ""
    return any(t in type_line for t in _BASIC_LAND_TYPES)


def classify_cube_category(card: dict) -> str:
    """Classify a hydrated card into one of nine cube draft categories.

    Returns one of:
      "W" / "U" / "B" / "R" / "G" — mono-color non-land. Includes mana
            dorks and land-fetchers that have a color in their identity
            (Llanowar Elves, Birds of Paradise, Cultivate, Sakura-Tribe
            Elder). These slot into their mono-color pack position so
            every pack offers a color-specific card for each color.
      "M" — multicolor non-land (includes multicolor ramp like Golos).
      "L" — land that taps for mana directly (duals, Command Tower,
            basic-typed lands, utility lands with mana abilities).
      "F" — *colorless* fixing: cards with no color identity that
            produce mana of any kind (Sol Ring, Arcane Signet, Chromatic
            Lantern, Chromatic Sphere) or fetch lands (Wayfarer's Bauble,
            Expedition Map), *plus* lands that only sacrifice to fetch a
            land without tapping for mana themselves (Evolving Wilds,
            Fabled Passage, all fetch lands). Packs reserve one F slot
            so every pack offers a drafter a colorless fixing option.
      "C" — colorless non-land non-fixing (token generators, utility
            artifacts like Sensei's Divining Top, colorless threats).

    The key distinction from simpler "produces mana = fixing" rules:
    cube-utils pack templates put one-of-each-color in every pack, so a
    mana dork with color identity G belongs in the G slot (where it
    helps drafters building green) rather than the colorless F slot.
    Only cards with NO color identity compete for the F slot.

    Basic lands are unlimited outside the cube and not part of the draft
    pool, so ``F`` isn't about mana availability — it's about the
    colorless slot reserved for generically-useful fixing tools.

    Priority:
      land → (L vs F based on direct mana production)
      colorless non-land mana rock / land-fetcher → F
      multicolor → M
      mono-color (including colored mana dorks / colored ramp) → W/U/B/R/G
      colorless non-fixing → C
    """
    identity = card.get("color_identity", []) or []

    if is_land(card):
        if _land_produces_mana_directly(card):
            return "L"
        return "F"

    # Non-land F is restricted to COLORLESS fixing. Colored mana sources
    # (Llanowar Elves, Birds of Paradise, Cultivate) slot into their
    # mono-color position so each pack offers drafters color-specific
    # fixing help.
    if not identity and is_ramp(card):
        return "F"

    if len(identity) >= 2:
        return "M"

    if len(identity) == 1:
        return identity[0]

    return "C"
