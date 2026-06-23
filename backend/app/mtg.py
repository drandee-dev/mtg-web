"""Thin, web-friendly wrappers around the existing ``mtg_utils`` library.

This is the single seam between the FastAPI layer and the deck/card/rules logic.
Heavy resources (the ~550MB Scryfall bulk index and the parsed Comprehensive Rules)
are loaded once and cached as module-level singletons, then reused across requests.
"""

from __future__ import annotations

import functools
import os
import re
from typing import Any

from app import config

config.bootstrap_mtg_utils()

# Imports below resolve through the bootstrapped sys.path entry.
from mtg_utils._name_index import build_name_index, keep_cheaper  # noqa: E402
from mtg_utils.bulk_loader import bulk_mtime, load_bulk_cards  # noqa: E402
from mtg_utils.card_classify import extract_price, partner_ability, valid_partner_search  # noqa: E402
from mtg_utils.card_search import search_cards as _search_cards  # noqa: E402
from mtg_utils.combo_search import combo_search  # noqa: E402
from mtg_utils.deck_stats import deck_stats, detect_bracket  # noqa: E402
from mtg_utils.edhrec_lookup import edhrec_lookup  # noqa: E402
from mtg_utils.format_config import FORMAT_CONFIGS  # noqa: E402
from mtg_utils.theme_presets import get_preset  # noqa: E402
from mtg_utils.export_deck import export_moxfield  # noqa: E402
from mtg_utils.hydrated_deck import HydratedDeck  # noqa: E402
from mtg_utils.legality_audit import legality_audit  # noqa: E402
from mtg_utils.mana_audit import mana_audit  # noqa: E402
from mtg_utils.parse_deck import parse_deck_text  # noqa: E402
from mtg_utils.rules_lookup import (  # noqa: E402
    grep_rules,
    load_rules,
    lookup_rule,
    lookup_term,
)
from mtg_utils.scryfall_lookup import _extract_fields  # noqa: E402

# Register Pauper + Pauper Commander for the web app WITHOUT editing the shared
# mtg_utils library (which the local Claude Code skills also use). This mutates the
# in-memory dict for this process only; Scryfall provides both legality keys.
FORMAT_CONFIGS.setdefault("pauper", {**FORMAT_CONFIGS["legacy"], "legality_key": "pauper"})
FORMAT_CONFIGS.setdefault(
    "paupercommander", {**FORMAT_CONFIGS["commander"], "legality_key": "paupercommander"}
)


# --------------------------------------------------------------------------- #
# Cached heavy resources
# --------------------------------------------------------------------------- #
# The bulk index is rebuilt when the underlying bulk file changes (keyed on its
# sidecar mtime), so a daily Scryfall re-download refreshes prices/cards WITHOUT a
# process restart. A bare functools.cache would pin the first build forever.
_index_cache: tuple[float, Any] | None = None


def _bulk_index() -> Any:
    """Name -> cheapest-printing Scryfall record index; refreshed on bulk-file change."""
    global _index_cache
    token = bulk_mtime(config.BULK_PATH)
    if _index_cache is None or _index_cache[0] != token:
        cards = load_bulk_cards(config.BULK_PATH)
        _index_cache = (token, build_name_index(cards, reduce=keep_cheaper))
    return _index_cache[1]


@functools.cache
def _rules() -> dict[str, Any]:
    return load_rules(config.rules_path())


def data_as_of() -> str | None:
    """ISO date of the bulk card data (file mtime) — for a 'prices as of' note."""
    import datetime

    try:
        ts = config.BULK_PATH.stat().st_mtime
    except OSError:
        return None
    return datetime.date.fromtimestamp(ts).isoformat()


def warm() -> None:
    """Pre-load both heavy resources so the first user request isn't slow."""
    _bulk_index()
    _rules()


# --------------------------------------------------------------------------- #
# Card images (Scryfall CDN URLs straight from the bulk data; no extra API calls)
# --------------------------------------------------------------------------- #
def _image_from_record(rec: dict | None, size: str = "normal") -> str | None:
    """Scryfall image URL for a card record, handling double-faced cards
    (front face). ``size`` is a Scryfall image key: small | normal | large | art_crop.
    """
    if not rec:
        return None
    uris = rec.get("image_uris")
    if not uris:
        faces = rec.get("card_faces") or []
        if faces:
            uris = (faces[0] or {}).get("image_uris")
    return (uris or {}).get(size)


def card_image(name: str) -> dict[str, Any]:
    """Resolve a (possibly partial-cased/diacritic) card name to its images.
    Returns {name, found, image, thumb}; found=False for tokens/unknowns so the UI
    can fall back to plain text.
    """
    rec = _bulk_index().get(name)
    if not rec:
        return {"name": name, "found": False, "image": None, "thumb": None}
    return {
        "name": rec.get("name", name),
        "found": True,
        "image": _image_from_record(rec, "normal"),
        "thumb": _image_from_record(rec, "small"),
        "art_crop": _image_from_record(rec, "art_crop"),
        "type_line": rec.get("type_line", ""),
        "color_identity": rec.get("color_identity", []),
        "cmc": rec.get("cmc", 0),
        "price_usd": extract_price(rec),
        "roles": _classify_roles(rec),
    }


def card_images(names: list[str]) -> dict[str, dict]:
    """Batch version: {requested_name: {found, image, thumb}}."""
    return {n: card_image(n) for n in names}


# --------------------------------------------------------------------------- #
# Rules lookup (rules-lawyer core)
# --------------------------------------------------------------------------- #
def rules_search(
    *,
    rule: str | None = None,
    term: str | None = None,
    grep: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    parsed = _rules()
    out: dict[str, Any] = {"effective_date": parsed.get("effective_date", "")}
    if rule:
        out["mode"] = "rule"
        out["query"] = rule
        out["match"] = lookup_rule(parsed, rule)
    elif term:
        out["mode"] = "term"
        out["query"] = term
        out["match"] = lookup_term(parsed, term)
    elif grep:
        out["mode"] = "grep"
        out["query"] = grep
        out["matches"] = grep_rules(parsed, grep, limit=limit)
    else:
        msg = "Provide exactly one of: rule, term, grep"
        raise ValueError(msg)
    return out


# --------------------------------------------------------------------------- #
# Card search (deck-building card lookup)
# --------------------------------------------------------------------------- #
def card_search(**kwargs: Any) -> list[dict]:
    """Search bulk data with the same filters as the `card-search` CLI.

    Returns compact projected card dicts (name, type, cmc, colors, oracle, price, ...).
    """
    results = _search_cards(config.BULK_PATH, **kwargs)
    return [_extract_fields(c) for c in results]


# --------------------------------------------------------------------------- #
# Deck analysis (deck-wizard / deck-forge deterministic core)
# --------------------------------------------------------------------------- #
# Card types in display priority — each card is bucketed into the first that matches,
# so the counts partition the deck (matches how Archidekt's type breakdown reads).
_TYPE_BUCKETS = [
    ("Land", "Lands"),
    ("Creature", "Creatures"),
    ("Planeswalker", "Planeswalkers"),
    ("Battle", "Battles"),
    ("Instant", "Instants"),
    ("Sorcery", "Sorceries"),
    ("Artifact", "Artifacts"),
    ("Enchantment", "Enchantments"),
]


def _primary_type(type_line: str) -> str:
    for key, label in _TYPE_BUCKETS:
        if key in type_line:
            return label
    return "Other"


def deck_breakdown(hd: HydratedDeck) -> dict[str, Any]:
    """Archidekt-style composition: card counts by type and rarity, plus total price."""
    types: dict[str, int] = {}
    rarities: dict[str, int] = {}
    price = 0.0
    for entry, card in hd.entries(zones=("commanders", "cards")):
        if card is None:
            continue
        qty = entry.get("quantity", 1)
        types[_primary_type(card.get("type_line") or "")] = (
            types.get(_primary_type(card.get("type_line") or ""), 0) + qty
        )
        rarity = (card.get("rarity") or "unknown").capitalize()
        rarities[rarity] = rarities.get(rarity, 0) + qty
        p = extract_price(card)
        if p:
            price += p * qty
    # Order types by the display priority, dropping empties.
    ordered = {label: types[label] for _, label in _TYPE_BUCKETS if types.get(label)}
    if types.get("Other"):
        ordered["Other"] = types["Other"]
    return {
        "types": ordered,
        "rarities": rarities,
        "price_usd": round(price, 2),
        "prices_as_of": data_as_of(),
    }


# Mana-viability tuning (named so they're easy to adjust). Replaces the Burgess
# land-count formula: viability is judged from land count + ramp + average mana value.
_VIA_SOURCE_BASE = 0.30   # baseline mana-source fraction of the deck
_VIA_SOURCE_MV = 0.03     # extra sources per +1 average mana value (curve cost)
_VIA_LAND_FLOOR = 0.27    # minimum real lands (ramp can't fully substitute)
_VIA_WARN = 0.88          # within this fraction of target/floor → WARN, below → FAIL


def _rank(status: str) -> int:
    return {"PASS": 0, "OK": 0, "WARN": 1, "FAIL": 2}.get((status or "").upper(), 2)


def mana_viability(
    land_count: int, ramp_count: int, avg_mv: float, deck_size: int
) -> dict[str, Any]:
    """Judge the mana base from land count + ramp density + average mana value.

    Mana sources = lands + ramp (ramp ≈ a pseudo-source). The target scales with the
    curve (higher avg MV needs more sources). A separate land floor ensures there are
    enough real lands to actually cast the ramp. Status is the worse of the two checks.
    """
    sources = land_count + ramp_count
    target = round(deck_size * (_VIA_SOURCE_BASE + _VIA_SOURCE_MV * avg_mv))
    floor = round(deck_size * _VIA_LAND_FLOOR)

    def gate(value: int, threshold: int) -> str:
        if value >= threshold:
            return "PASS"
        if value >= round(threshold * _VIA_WARN):
            return "WARN"
        return "FAIL"

    sources_status = gate(sources, target)
    land_status = gate(land_count, floor)
    status = "FAIL" if "FAIL" in (sources_status, land_status) else (
        "WARN" if "WARN" in (sources_status, land_status) else "PASS"
    )
    return {
        "status": status,
        "land_count": land_count,
        "ramp_count": ramp_count,
        "avg_mv": avg_mv,
        "mana_sources": sources,
        "recommended_sources": target,
        "land_floor": floor,
        "sources_status": sources_status,
        "land_status": land_status,
    }


def analyze_deck(text: str, *, fmt: str = "commander") -> dict[str, Any]:
    """Parse a pasted decklist, join it to Scryfall records, and run the
    deterministic audits: stats + curve, mana base, legality, and bracket estimate.
    """
    deck = parse_deck_text(text, format=fmt)
    hd = HydratedDeck.from_parsed(deck, _bulk_index())

    stats = deck_stats(hd)
    mana = mana_audit(hd)
    legality = legality_audit(hd)
    bracket = detect_bracket(list(hd.records), stats.get("avg_cmc", 0.0))
    breakdown = deck_breakdown(hd)

    # Replace the Burgess-based land verdict with the land+ramp+avgMV viability metric,
    # keeping mana_audit's color-fixing check. Overall mana status = worse of the two.
    deck_size = FORMAT_CONFIGS.get(fmt, {}).get("deck_size") or deck.get("deck_size") or 100
    viability = mana_viability(
        mana.get("land_count", 0),
        mana.get("ramp_count", 0),
        mana.get("avg_cmc", 0.0),
        deck_size,
    )
    mana["viability"] = viability
    color_status = mana.get("color_balance_status", "PASS")
    mana["overall_status"] = (
        viability["status"] if _rank(viability["status"]) >= _rank(color_status) else color_status
    )

    # Names we could not match to a Scryfall record (typos / unknown cards).
    # ``hd.by_name`` is a NameIndex whose ``in`` test NFKD-folds the query, so check
    # membership directly rather than against its (folded) iterated keys.
    unresolved = sorted(
        {
            e["name"]
            for zone in ("commanders", "cards", "sideboard")
            for e in deck.get(zone, [])
            if e["name"] not in hd.by_name
        }
    )

    return {
        "format": deck.get("format", fmt),
        "total_cards": deck.get("total_cards", 0),
        "commanders": [c["name"] for c in deck.get("commanders", [])],
        "has_records": hd.has_records,
        "unresolved": unresolved,
        "stats": stats,
        "mana": mana,
        "legality": legality,
        "bracket": bracket,
        "breakdown": breakdown,
    }


def export_deck_text(text: str, *, fmt: str = "commander") -> str:
    """Normalize a pasted decklist (any supported format) into canonical
    Archidekt/Moxfield import text: ``N CardName`` lines, a ``Sideboard`` section,
    duplicates merged and set codes stripped (via parse_deck_text + export_moxfield).
    """
    deck = parse_deck_text(text, format=fmt)
    return export_moxfield(deck)


# --------------------------------------------------------------------------- #
# Deck-building helpers (deterministic; some call external services)
# --------------------------------------------------------------------------- #
def deck_recommendations(text: str, *, fmt: str = "commander") -> dict[str, Any]:
    """EDHREC recommendations for the deck's commander(s), tagged with whether each
    card is already in the list. Commander-style formats only. Degrades gracefully if
    EDHREC is unreachable.
    """
    deck = parse_deck_text(text, format=fmt)
    commanders = [c["name"] for c in deck.get("commanders", [])]
    if not commanders:
        return {"commanders": [], "categories": {}, "note": "Add a commander to get recommendations."}
    try:
        categories = edhrec_lookup(commanders)
    except Exception as exc:  # noqa: BLE001 - external service; degrade, don't 500
        return {"commanders": commanders, "categories": {}, "note": f"EDHREC unavailable: {exc}"}

    hd = HydratedDeck.from_parsed(deck, _bulk_index())
    for cards in categories.values():
        for cv in cards:
            cv["in_deck"] = cv.get("name", "") in hd.by_name
    return {"commanders": commanders, "categories": categories}


def deck_combos(text: str, *, fmt: str = "commander") -> dict[str, Any]:
    """Combos present in the deck plus near-misses (one card away) via Commander
    Spellbook. Returns {"combos": [...], "near_misses": [...]}; empty if the service
    is unavailable (combo_search handles that internally).
    """
    deck = parse_deck_text(text, format=fmt)
    hd = HydratedDeck.from_parsed(deck, _bulk_index())
    return combo_search(hd)


def commander_search(query: str, *, limit: int = 12, partner_of: str | None = None) -> list[dict]:
    """Resolve a typed (possibly partial) name to commander-eligible cards, so
    "nethroi" finds "Nethroi, Apex of Death". Reuses card_search's commander filter.
    When *partner_of* is given, results are filtered to legal partners for that card.
    """
    extra: dict[str, Any] = {}
    if partner_of:
        first_card = _bulk_index().get(partner_of)
        if not first_card:
            return []
        pfilter = valid_partner_search(first_card)
        if not pfilter:
            return []
        extra = dict(pfilter)

    results = _search_cards(
        config.BULK_PATH,
        name=query,
        is_commander_filter=True,
        format="commander",
        sort="name-asc",
        limit=limit,
        **extra,
    )
    out = []
    for c in results:
        entry = {
            "name": c.get("name", ""),
            "type_line": c.get("type_line", ""),
            "color_identity": c.get("color_identity", []),
            "mana_cost": c.get("mana_cost", ""),
        }
        if not partner_of:
            entry["partner_kind"] = partner_ability(c)["kind"]
        out.append(entry)
    return out


# Deterministic "what's my deck made of / missing" view. Each category counts deck cards
# matching a theme preset (or a deck_stats field), with a Commander rule-of-thumb target.
# Targets only flag thin categories in commander-style formats.
_COMPOSITION = [
    ("lands", "Lands", 36, None),       # from deck_stats.land_count
    ("ramp", "Ramp", 10, None),         # from deck_stats.ramp_count
    ("card-draw", "Card draw", 10, ("card-draw", "cantrip")),
    ("removal", "Spot removal", 8, ("removal",)),
    ("board-wipe", "Board wipes", 3, ("board-wipe",)),
    ("counterspell", "Counterspells", 0, ("counterspell",)),
    ("tutors", "Tutors", 0, ("tutors",)),
    ("tokens", "Token makers", 0, ("tokens",)),
]


def deck_composition(text: str, *, fmt: str = "commander") -> dict[str, Any]:
    """Category counts (removal, draw, wipes, ramp, lands, …) vs Commander rules-of-thumb,
    flagging thin categories. The deterministic, accessible 'what is my deck missing'.
    """
    deck = parse_deck_text(text, format=fmt)
    hd = HydratedDeck.from_parsed(deck, _bulk_index())
    stats = deck_stats(hd)
    records = hd.expanded(zones=("commanders", "cards"))  # repeated by quantity

    is_commander_fmt = FORMAT_CONFIGS.get(fmt, {}).get("has_commander", False)
    categories: list[dict] = []
    for key, label, target, presets in _COMPOSITION:
        if key == "lands":
            count = stats.get("land_count", 0)
        elif key == "ramp":
            count = stats.get("ramp_count", 0)
        else:
            matchers = [get_preset(p) for p in presets]
            count = sum(1 for c in records if any(m.matches(c) for m in matchers))
        status = "ok"
        if is_commander_fmt and target:
            status = "thin" if count < round(target * 0.6) else "ok"
        categories.append(
            {"key": key, "label": label, "count": count,
             "target": target if (is_commander_fmt and target) else None, "status": status}
        )
    return {"format": fmt, "is_commander": is_commander_fmt, "categories": categories}


# --------------------------------------------------------------------------- #
# Shared AI helper
# --------------------------------------------------------------------------- #
_AI_MODEL = "claude-sonnet-4-6"
_AI_MODEL_FALLBACK = "claude-haiku-4-5"

# Set by main.py to record token usage for cost tracking
on_ai_usage: Any = None  # callable(input_tokens, output_tokens) or None


def _ai_call(
    system: str,
    user_msg: str,
    *,
    api_key: str | None = None,
    max_tokens: int = 1500,
    cache_user_msg: bool = False,
) -> dict[str, Any]:
    """Shared wrapper for all AI features. Uses Sonnet by default, falls back to
    Haiku if Sonnet is unavailable. Supports Anthropic prompt caching on the user
    message (the deck context), which is shared across cuts/fills/explain/combos.
    """
    import anthropic

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {
            "error": True,
            "result": "No API key available. Add your Anthropic API key in Settings, or ask the site owner to configure one.",
        }

    # Build messages with optional cache_control on the user message
    if cache_user_msg:
        messages = [{"role": "user", "content": [
            {"type": "text", "text": user_msg, "cache_control": {"type": "ephemeral"}},
        ]}]
    else:
        messages = [{"role": "user", "content": user_msg}]

    client = anthropic.Anthropic(api_key=key)
    for model in (_AI_MODEL, _AI_MODEL_FALLBACK):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )
            usage = response.usage
            cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
            if on_ai_usage and callable(on_ai_usage):
                on_ai_usage(usage.input_tokens, usage.output_tokens)
            return {
                "error": False,
                "result": response.content[0].text,
                "model": model,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "cache_read_tokens": cache_read,
            }
        except anthropic.NotFoundError:
            continue
        except anthropic.AuthenticationError:
            return {"error": True, "result": "Invalid API key. Check your key in Settings."}
        except Exception as exc:
            return {"error": True, "result": f"AI request failed: {exc}"}

    return {"error": True, "result": "No AI model available. Both Sonnet and Haiku returned 404."}


def _ai_call_stream(
    system: str,
    user_msg: str,
    *,
    api_key: str | None = None,
    max_tokens: int = 1500,
    cache_user_msg: bool = False,
):
    """Streaming variant of _ai_call. Yields SSE-formatted chunks for text responses,
    or heartbeat events for structured (JSON) responses. The final event includes
    the complete text and token usage.
    """
    import anthropic
    import json as _json

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        yield f"data: {_json.dumps({'status': 'error', 'message': 'No API key available.'})}\n\n"
        return

    if cache_user_msg:
        messages = [{"role": "user", "content": [
            {"type": "text", "text": user_msg, "cache_control": {"type": "ephemeral"}},
        ]}]
    else:
        messages = [{"role": "user", "content": user_msg}]

    client = anthropic.Anthropic(api_key=key)
    for model in (_AI_MODEL, _AI_MODEL_FALLBACK):
        try:
            with client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            ) as stream:
                full_text = ""
                for text in stream.text_stream:
                    full_text += text
                    yield f"data: {_json.dumps({'status': 'streaming', 'text': text})}\n\n"

                resp = stream.get_final_message()
                usage = resp.usage
                if on_ai_usage and callable(on_ai_usage):
                    on_ai_usage(usage.input_tokens, usage.output_tokens)

                yield f"data: {_json.dumps({'status': 'done', 'text': full_text, 'model': model, 'input_tokens': usage.input_tokens, 'output_tokens': usage.output_tokens})}\n\n"
                return
        except anthropic.NotFoundError:
            continue
        except anthropic.AuthenticationError:
            yield f"data: {_json.dumps({'status': 'error', 'message': 'Invalid API key.'})}\n\n"
            return
        except Exception as exc:
            yield f"data: {_json.dumps({'status': 'error', 'message': str(exc)})}\n\n"
            return

    yield f"data: {_json.dumps({'status': 'error', 'message': 'No AI model available.'})}\n\n"


import hashlib
import time as _time
from concurrent.futures import ThreadPoolExecutor as _TPE

_ctx_cache: dict[str, tuple[float, dict]] = {}
_CTX_TTL = 30  # seconds


def _deck_context_cached(text: str, fmt: str = "commander", *, bracket: int | None = None) -> dict:
    """Cached wrapper around _deck_context. Reuses the result for 30s if the deck text hasn't changed."""
    key = hashlib.md5(f"{text}|{fmt}|{bracket}".encode()).hexdigest()
    now = _time.time()
    if key in _ctx_cache and now - _ctx_cache[key][0] < _CTX_TTL:
        return _ctx_cache[key][1]
    ctx = _deck_context(text, fmt, bracket=bracket)
    _ctx_cache[key] = (now, ctx)
    # Evict stale entries
    stale = [k for k, (t, _) in _ctx_cache.items() if now - t > _CTX_TTL * 3]
    for k in stale:
        _ctx_cache.pop(k, None)
    return ctx


def _deck_context(
    text: str, fmt: str = "commander", *, bracket: int | None = None
) -> dict[str, Any]:
    """Parse a decklist and build rich context for AI prompts.

    Returns a dict with: deck, hd, summary (text), combo_text, composition_text,
    commander_oracle, bracket info — everything the AI needs to reason about
    synergies, combos, and power level.
    """
    deck = parse_deck_text(text, format=fmt)
    hd = HydratedDeck.from_parsed(deck, _bulk_index())
    stats = deck_stats(hd)
    idx = _bulk_index()

    lines = []
    commanders = [c["name"] for c in deck.get("commanders", [])]

    # Commander oracle text — critical for understanding the deck's strategy
    cmd_oracle_lines = []
    for cname in commanders:
        rec = idx.get(cname)
        if rec:
            oracle = rec.get("oracle_text", "")
            kws = rec.get("keywords", [])
            cmd_oracle_lines.append(
                f"**{cname}** ({rec.get('mana_cost', '')}) — {rec.get('type_line', '')}\n"
                f"Oracle: {oracle}"
                + (f"\nKeywords: {', '.join(kws)}" if kws else "")
            )

    if commanders:
        lines.append(f"Commander(s): {', '.join(commanders)}")
    if cmd_oracle_lines:
        lines.append("\n## Commander card text")
        lines.extend(cmd_oracle_lines)
        lines.append("")

    # Bracket / power level
    bracket_info = detect_bracket(list(hd.records), stats.get("avg_cmc", 0.0))
    target_bracket = bracket
    lines.append(f"Format: {fmt} | Cards: {deck.get('total_cards', 0)} | "
                 f"Avg MV: {stats.get('avg_cmc', 0):.1f} | "
                 f"Lands: {stats.get('land_count', 0)} | Ramp: {stats.get('ramp_count', 0)}")
    if bracket_info.get("bracket") is not None:
        lines.append(f"Detected bracket: {bracket_info['bracket']} — {bracket_info.get('name', '')}")
    if target_bracket is not None:
        lines.append(f"Target bracket: {target_bracket}")
    lines.append("")

    # Card list with oracle text so the AI can see what each card does
    lines.append("## Decklist (with oracle text)")
    for entry, card in hd.entries(zones=("commanders", "cards")):
        name = entry.get("name", "?")
        qty = entry.get("quantity", 1)
        if card:
            tl = card.get("type_line", "")
            mc = card.get("mana_cost", "")
            oracle = card.get("oracle_text", "")
            pt = ""
            if card.get("power") is not None:
                pt = f" ({card['power']}/{card['toughness']})"
            oracle_short = oracle.replace("\n", " | ") if oracle else ""
            lines.append(f"{qty} {name} [{tl}] {mc}{pt} — {oracle_short}")
        else:
            lines.append(f"{qty} {name}")

    # Pre-compute a strategy profile from the commander's oracle text and deck cards
    # so the AI has an explicit synergy map instead of needing to infer it.
    cmd_oracle_full = " ".join(
        (idx.get(cn) or {}).get("oracle_text", "") for cn in commanders
    ).lower()
    strategy_notes = ["\n## Deck strategy analysis (pre-computed — trust this)"]

    cmd_mechanics = []
    _mechanic_map = [
        ("mutate", "MUTATE — all mutate creatures are core synergy pieces and mutate targets"),
        ("graveyard", "GRAVEYARD — cards that fill or interact with the graveyard are enablers"),
        ("total power", "LOW-POWER CREATURES — the commander has a power restriction on reanimation, so low-power or */* creatures are INTENTIONALLY chosen"),
        ("sacrifice", "SACRIFICE — sacrifice outlets and death triggers are part of the engine"),
        ("enters the battlefield", "ETB — creatures with ETB effects are value targets"),
        ("experience counter", "EXPERIENCE — cards that trigger experience are core"),
        ("instant or sorcery", "SPELLSLINGER — instants/sorceries fuel the commander"),
        ("token", "TOKENS — token generation supports the strategy"),
        ("+1/+1 counter", "COUNTERS — +1/+1 counter cards synergize with the commander"),
    ]
    for keyword, desc in _mechanic_map:
        if keyword in cmd_oracle_full:
            cmd_mechanics.append(desc)
    if cmd_mechanics:
        strategy_notes.append("Commander cares about: " + "; ".join(cmd_mechanics))

    # Count cards by detected synergy role
    role_counts: dict[str, list[str]] = {}
    for entry, card in hd.entries(zones=("commanders", "cards")):
        if not card:
            continue
        name = entry.get("name", "?")
        oracle_l = (card.get("oracle_text") or "").lower()
        kws = [k.lower() for k in (card.get("keywords") or [])]
        power = card.get("power", "")

        if "mutate" in " ".join(kws) or "mutate" in oracle_l:
            role_counts.setdefault("Mutate synergy", []).append(name)
        if "dredge" in oracle_l or "mill" in oracle_l or "into your graveyard" in oracle_l:
            role_counts.setdefault("Graveyard filler", []).append(name)
        if "whenever" in oracle_l and ("dies" in oracle_l or "graveyard" in oracle_l):
            role_counts.setdefault("Death/graveyard trigger", []).append(name)
        if power in ("0", "*", "X"):
            role_counts.setdefault("Low/variable power (reanimation target)", []).append(name)
        if "sacrifice" in oracle_l:
            role_counts.setdefault("Sacrifice synergy", []).append(name)

    if role_counts:
        strategy_notes.append("Key synergy roles in this deck:")
        for role, cards in role_counts.items():
            strategy_notes.append(f"  - {role} ({len(cards)}): {', '.join(cards[:10])}")
        strategy_notes.append("DO NOT suggest cutting cards that fill these synergy roles unless the deck has excess redundancy in that specific role.")

    strategy_notes.append("This is Commander format (multiplayer, 40 life, singleton). Evaluate cards for multiplayer value, not 1v1.")
    lines.extend(strategy_notes)

    summary = "\n".join(lines)

    # Combos (if external service is available)
    combo_text = ""
    try:
        combo_data = combo_search(hd)
        combo_lines = []
        for c in (combo_data.get("combos") or [])[:10]:
            pieces = " + ".join(c.get("cards", []))
            combo_lines.append(f"- COMBO: {pieces}")
        for nm in (combo_data.get("near_misses") or [])[:8]:
            pieces = " + ".join(nm.get("cards", []))
            missing = nm.get("missing_card") or nm.get("missing_template", "?")
            combo_lines.append(f"- NEAR-MISS (need {missing}): {pieces}")
        if combo_lines:
            combo_text = "\n## Combos & near-misses in this deck\n" + "\n".join(combo_lines)
    except Exception:
        pass

    # Composition
    comp_text = ""
    try:
        comp = deck_composition(text, fmt=fmt)
        comp_lines = []
        for c in comp.get("categories", []):
            flag = " (THIN)" if c.get("status") == "thin" else ""
            tgt = f"/{c['target']}" if c.get("target") else ""
            comp_lines.append(f"- {c['label']}: {c['count']}{tgt}{flag}")
        if comp_lines:
            comp_text = "\n## Composition\n" + "\n".join(comp_lines)
    except Exception:
        pass

    return {
        "deck": deck,
        "hd": hd,
        "summary": summary + combo_text + comp_text,
        "combo_text": combo_text,
        "composition_text": comp_text,
        "commanders": commanders,
        "bracket": bracket_info,
        "target_bracket": target_bracket,
    }


# --------------------------------------------------------------------------- #
# AI Suggested Cuts
# --------------------------------------------------------------------------- #
_CUTS_SYSTEM = """You are an expert MTG deck builder evaluating cuts for a Commander deck. You have the FULL deck context: commander oracle text, card list with keywords, detected combos, composition, and the target power bracket.

CRITICAL RULES FOR SUGGESTING CUTS:
1. READ THE COMMANDER'S ORACLE TEXT CAREFULLY. Identify the key mechanics and strategies the commander enables. Any card that synergizes with those mechanics — even if it looks weak in isolation — is a core piece, not a cut.
2. NEVER suggest cutting combo pieces. Check the "Combos & near-misses" section — any card listed there is load-bearing.
3. RESPECT THE BRACKET. Evaluate cards against the target bracket, not against the strongest possible version of the deck. Cards that are appropriate for the target power level are NOT cuts.
4. CHECK KEYWORD SYNERGIES. Cross-reference each card's keywords against the commander's oracle text and the deck's overall mechanical theme. A card that shares keywords or mechanics with the commander has hidden value beyond its stats.
5. Only suggest cards that are genuinely redundant, off-strategy, or significantly weaker than other cards filling the same role IN THIS SPECIFIC DECK at this bracket.

For each cut, provide:
- The exact card name (must be in the deck list)
- A brief reason (1 sentence) that shows you understand why this card is the weakest link given the commander's strategy and the deck's bracket

IMPORTANT: Your entire response must be ONLY a JSON array. No preamble, no explanation, no markdown.
Start your response with [ and end with ]. Example format:
[{"name": "Card Name", "reason": "One sentence why."}]

Suggest 8-12 cuts ranked from weakest to least-weak."""


def _parse_ai_json(raw: str) -> Any:
    """Parse JSON from an AI response. Handles code fences, preamble text,
    and other formatting Sonnet sometimes adds around the JSON."""
    import json as _json
    raw = raw.strip()
    # Strip code fences
    if "```" in raw:
        raw = re.sub(r"```\w*\n?", "", raw).strip()
    # Try parsing as-is first
    try:
        return _json.loads(raw)
    except _json.JSONDecodeError:
        pass
    # Extract JSON array or object from surrounding text
    for pattern in (r"(\[[\s\S]*\])", r"(\{[\s\S]*\})"):
        m = re.search(pattern, raw)
        if m:
            try:
                return _json.loads(m.group(1))
            except _json.JSONDecodeError:
                continue
    raise ValueError(f"No valid JSON found in response: {raw[:200]}")


def budget_swaps(text: str, *, fmt: str = "commander", threshold: float = 5.0) -> dict[str, Any]:
    """Find cheaper alternatives for expensive cards. No AI needed — pure search."""
    deck = parse_deck_text(text, format=fmt)
    hd = HydratedDeck.from_parsed(deck, _bulk_index())
    idx = _bulk_index()
    ci_lists = [((idx.get(c["name"]) or {}).get("color_identity") or []) for c in deck.get("commanders", [])]
    ci = "".join(color for ci_list in ci_lists for color in ci_list)
    in_deck = {e["name"] for zone in ("commanders", "cards") for e in deck.get(zone, [])}

    swaps = []
    for entry, card in hd.entries(zones=("cards",)):
        if not card:
            continue
        price = extract_price(card)
        if not price or price < threshold:
            continue
        name = entry.get("name", "")
        roles = _classify_roles(card)
        alt = None
        for role in roles[:2]:
            search_cfg = None
            for key, label in _ROLE_CHECKS:
                if label == role:
                    search_cfg = _FILL_SEARCH.get(key)
                    break
            if not search_cfg:
                for pattern, label in _ORACLE_ROLES:
                    if label == role:
                        search_cfg = {"oracle": pattern, "type": None}
                        break
            if search_cfg:
                try:
                    cands = _search_cards(
                        config.BULK_PATH, oracle=search_cfg.get("oracle"),
                        card_type=search_cfg.get("type"), color_identity=ci or None,
                        format=fmt, sort="price-asc", limit=10,
                    )
                    for c in cands:
                        cn = c.get("name", "")
                        cp = extract_price(c)
                        if cn not in in_deck and cn != name and cp and cp < price * 0.5:
                            alt = {"name": cn, "price": round(cp, 2), "role": role}
                            break
                except Exception:
                    pass
            if alt:
                break
        if not alt:
            type_line = (card.get("type_line") or "").lower()
            for t in ("creature", "instant", "sorcery", "artifact", "enchantment"):
                if t in type_line:
                    try:
                        cands = _search_cards(config.BULK_PATH, card_type=t, color_identity=ci or None,
                                              format=fmt, sort="price-asc", limit=10)
                        for c in cands:
                            cn = c.get("name", "")
                            cp = extract_price(c)
                            if cn not in in_deck and cn != name and cp and cp < price * 0.5:
                                alt = {"name": cn, "price": round(cp, 2), "role": t.capitalize()}
                                break
                    except Exception:
                        pass
                    break
        if alt:
            swaps.append({"card": name, "price": round(price, 2), "alternative": alt})
    swaps.sort(key=lambda s: s["price"], reverse=True)
    return {"swaps": swaps, "total_savings": round(sum(s["price"] - s["alternative"]["price"] for s in swaps), 2)}


def ai_suggest_cuts(
    text: str, *, fmt: str = "commander", bracket: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    ctx = _deck_context_cached(text, fmt, bracket=bracket)
    resp = _ai_call(_CUTS_SYSTEM, ctx["summary"], api_key=api_key, max_tokens=2000, cache_user_msg=True)
    if resp["error"]:
        return {"error": True, "message": resp["result"], "cuts": []}

    try:
        cuts = _parse_ai_json(resp["result"])
    except (ValueError, KeyError):
        cuts = [{"name": "Parse error", "reason": resp["result"][:200]}]

    # Find replacement candidates for each cut in parallel
    idx = _bulk_index()
    in_deck = {e["name"] for zone in ("commanders", "cards") for e in ctx["deck"].get(zone, [])}
    ci_lists = [((idx.get(c) or {}).get("color_identity") or []) for c in ctx["commanders"]]
    ci = "".join(color for ci_list in ci_lists for color in ci_list)
    deck_fmt = ctx["deck"].get("format", "commander")

    def _find_replacements(cut: dict) -> None:
        if cut.get("name") == "Parse error":
            return
        rec = idx.get(cut["name"])
        roles = _classify_roles(rec)
        replacements: list[dict] = []
        seen_names: set[str] = set()

        for role in roles[:2]:
            search_cfg = None
            for key, label in _ROLE_CHECKS:
                if label == role:
                    search_cfg = _FILL_SEARCH.get(key)
                    break
            if not search_cfg:
                for pattern, label in _ORACLE_ROLES:
                    if label == role:
                        search_cfg = {"oracle": pattern, "type": None}
                        break
            if search_cfg:
                try:
                    cands = _search_cards(
                        config.BULK_PATH, oracle=search_cfg.get("oracle"),
                        card_type=search_cfg.get("type"), color_identity=ci or None,
                        format=deck_fmt, sort="edhrec-desc", limit=15,
                    )
                    for c in cands:
                        name = c.get("name", "")
                        if name not in in_deck and name != cut["name"] and name not in seen_names:
                            seen_names.add(name)
                            replacements.append({"name": name, "role": role})
                        if len(replacements) >= 8:
                            break
                except Exception:
                    pass
            if len(replacements) >= 8:
                break

        if not replacements and rec:
            type_line = (rec.get("type_line") or "").lower()
            for t in ("creature", "instant", "sorcery", "artifact", "enchantment"):
                if t in type_line:
                    try:
                        cands = _search_cards(
                            config.BULK_PATH, card_type=t, color_identity=ci or None,
                            format=deck_fmt, sort="edhrec-desc", limit=15,
                        )
                        for c in cands:
                            name = c.get("name", "")
                            if name not in in_deck and name != cut["name"]:
                                replacements.append({"name": name, "role": t.capitalize()})
                            if len(replacements) >= 8:
                                break
                    except Exception:
                        pass
                    break

        cut["replacements"] = replacements
        cut["roles"] = roles

    with _TPE(max_workers=4) as pool:
        list(pool.map(_find_replacements, cuts))

    return {"error": False, "cuts": cuts, "model": resp.get("model")}


# --------------------------------------------------------------------------- #
# AI Composition Fills (deterministic search + AI narration)
# --------------------------------------------------------------------------- #
# Maps composition category keys to oracle-text search patterns that reliably
# find cards in that role. These are used for deterministic Scryfall search,
# NOT AI generation — so the results are always real cards in the right role.
_FILL_SEARCH = {
    "board-wipe": {"oracle": r"destroy all|exile all|all creatures get -|damage to each creature", "type": None},
    "removal": {"oracle": r"destroy target|exile target|deals \d+ damage to", "type": None},
    "card-draw": {"oracle": r"draw a card|draw cards|draw two|draws a card", "type": None},
    "ramp": {"oracle": r"add \{|search your library for a.*land|mana of any", "type": None},
    "lands": {"oracle": None, "type": "land"},
}

_FILLS_SYSTEM = """You are an expert MTG deck builder. From the VERIFIED card list below (all real cards, confirmed in the correct role), pick the 3-4 best fits for this specific deck and commander.

For each pick, give a 1-sentence reason why it fits THIS deck specifically.

IMPORTANT: Your entire response must be ONLY valid JSON. No preamble, no explanation, no markdown. Start with [ or { immediately. Format:
[{"name": "Card Name", "reason": "Why this fits this specific deck."}]

Only pick from the provided list. Do NOT suggest cards not in the list."""


def ai_composition_fills(
    text: str, *, fmt: str = "commander", bracket: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    ctx = _deck_context_cached(text, fmt, bracket=bracket)
    comp = deck_composition(text, fmt=fmt)
    thin = [c for c in comp.get("categories", []) if c.get("status") == "thin"]
    if not thin:
        return {"error": False, "fills": [], "message": "No thin categories — deck composition looks solid."}

    deck = ctx["deck"]
    hd = ctx["hd"]
    commanders = ctx["commanders"]
    ci_lists = [((_bulk_index().get(c) or {}).get("color_identity") or []) for c in commanders]
    ci = "".join(color for ci_list in ci_lists for color in ci_list)

    fills = []
    for cat in thin:
        key = cat["key"]
        label = cat["label"]

        # 1. Deterministic search for cards in this role
        search_cfg = _FILL_SEARCH.get(key, {})
        try:
            candidates = _search_cards(
                config.BULK_PATH,
                oracle=search_cfg.get("oracle"),
                card_type=search_cfg.get("type"),
                color_identity=ci or None,
                format=deck.get("format", "commander"),
                sort="edhrec-desc",
                limit=20,
            )
        except Exception:
            candidates = []

        # Filter out cards already in the deck
        in_deck = {e["name"] for zone in ("commanders", "cards") for e in deck.get(zone, [])}
        candidates = [c for c in candidates if c.get("name") not in in_deck][:12]

        # Build the full pool with names for skip/replace
        pool = [{"name": c["name"], "reason": f"Top {label.lower()}"} for c in candidates]

        if not candidates:
            fills.append({"category": label, "suggestions": [], "pool": []})
            continue

        if not api_key and not os.environ.get("ANTHROPIC_API_KEY"):
            fills.append({"category": label, "suggestions": pool[:4], "pool": pool})
            continue

        # AI picks the best fits from the verified list
        card_list = "\n".join(
            f"- {c['name']} ({c.get('mana_cost', '')}) — {(c.get('oracle_text') or '')[:120]}"
            for c in candidates
        )
        user_msg = (
            f"Commander: {', '.join(commanders)}\n"
            f"Commander oracle: {(_bulk_index().get(commanders[0]) or {}).get('oracle_text', '') if commanders else ''}\n"
            f"Category to fill: {label} ({cat['count']}/{cat['target']})\n"
            f"Target bracket: {bracket or 'auto'}\n\n"
            f"Verified {label.lower()} candidates:\n{card_list}"
        )

        resp = _ai_call(_FILLS_SYSTEM, user_msg, api_key=api_key, max_tokens=600, cache_user_msg=True)
        if resp["error"]:
            fills.append({"category": label, "suggestions": pool[:4], "pool": pool})
            continue

        try:
            picks = _parse_ai_json(resp["result"])
            cand_names = {c["name"] for c in candidates}
            picks = [p for p in picks if p.get("name") in cand_names][:4]
            if not picks:
                picks = pool[:4]
        except (ValueError, KeyError):
            picks = pool[:4]

        fills.append({"category": label, "suggestions": picks, "pool": pool})

    return {"error": False, "fills": fills, "model": _AI_MODEL}


# --------------------------------------------------------------------------- #
# AI Recommendation Explanations
# --------------------------------------------------------------------------- #
_EXPLAIN_SYSTEM = """You are an expert MTG deck builder. Explain why each recommended card fits this specific deck and commander strategy.

For each card, provide a 1-2 sentence explanation of WHY it synergizes — not just what the card does, but how it specifically works with the commander's abilities, the deck's combos, and the target power bracket.

IMPORTANT: Your entire response must be ONLY valid JSON. No preamble, no explanation, no markdown. Start with [ or { immediately. Format:
[{"name": "Card Name", "explanation": "Why this card specifically synergizes with this deck."}]"""


def ai_explain_recommendations(
    text: str, card_names: list[str], *, fmt: str = "commander",
    bracket: int | None = None, api_key: str | None = None,
) -> dict[str, Any]:
    ctx = _deck_context_cached(text, fmt, bracket=bracket)
    cards_list = "\n".join(f"- {n}" for n in card_names[:15])
    user_msg = f"{ctx['summary']}\n\n## Cards to explain\n{cards_list}"

    resp = _ai_call(_EXPLAIN_SYSTEM, user_msg, api_key=api_key, cache_user_msg=True)
    if resp["error"]:
        return {"error": True, "message": resp["result"], "explanations": []}

    try:
        explanations = _parse_ai_json(resp["result"])
    except (ValueError, KeyError):
        explanations = [{"name": "Parse error", "explanation": resp["result"][:200]}]

    return {"error": False, "explanations": explanations, "model": resp.get("model")}


# --------------------------------------------------------------------------- #
# AI Combo Guidance
# --------------------------------------------------------------------------- #
_COMBO_SYSTEM = """You are an expert MTG deck builder and combo specialist. Analyze which combos are worth building toward and which to skip, given the deck's strategy, commander, and target power bracket.

For each combo or near-miss, provide:
- Whether to BUILD toward it or SKIP it
- A brief reason (1-2 sentences) that considers the target bracket — a bracket 2-3 deck shouldn't chase cEDH combos

Also suggest any combos the deck could support that aren't listed, appropriate to the bracket.

IMPORTANT: Your entire response must be ONLY valid JSON. No preamble, no explanation, no markdown. Start with [ or { immediately. Format:
{"assessments": [{"combo": "Card A + Card B", "verdict": "BUILD or SKIP", "reason": "Why."}], "new_suggestions": [{"combo": "Card X + Card Y", "reason": "Why this combo fits the deck and bracket."}]}"""


def ai_combo_guidance(
    text: str, combos: list[dict], near_misses: list[dict],
    *, fmt: str = "commander", bracket: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    ctx = _deck_context_cached(text, fmt, bracket=bracket)

    combo_lines = []
    for c in combos[:10]:
        pieces = ", ".join(c.get("cards", []))
        combo_lines.append(f"- PRESENT: {pieces}")
    for nm in near_misses[:10]:
        pieces = ", ".join(nm.get("cards", []))
        missing = nm.get("missing_card") or nm.get("missing_template", "?")
        combo_lines.append(f"- NEAR-MISS (need {missing}): {pieces}")

    combo_desc = "\n".join(combo_lines) if combo_lines else "(No combos or near-misses found.)"
    user_msg = f"{ctx['summary']}\n\n## Combos & near-misses to assess\n{combo_desc}"

    resp = _ai_call(_COMBO_SYSTEM, user_msg, api_key=api_key, max_tokens=2000, cache_user_msg=True)
    if resp["error"]:
        return {"error": True, "message": resp["result"], "assessments": [], "new_suggestions": []}

    try:
        data = _parse_ai_json(resp["result"])
    except (ValueError, KeyError):
        data = {"assessments": [{"combo": "Parse error", "verdict": "—", "reason": resp["result"][:200]}], "new_suggestions": []}

    return {
        "error": False,
        "assessments": data.get("assessments", []),
        "new_suggestions": data.get("new_suggestions", []),
        "model": resp.get("model"),
    }


# --------------------------------------------------------------------------- #
# AI Deck Wizard — guided step-by-step builder
# --------------------------------------------------------------------------- #
_ROLE_CHECKS = [
    ("removal", "Removal"),
    ("board-wipe", "Board wipe"),
    ("card-draw", "Draw"),
    ("cantrip", "Draw"),
    ("counterspell", "Counter"),
    ("tutors", "Tutor"),
    ("tokens", "Tokens"),
]

_ORACLE_ROLES = [
    (r"\bprotection from\b|\bhexproof\b|\bindestructible\b|\bshroud\b|\bward\b", "Protection"),
    (r"\breturn.*from.*graveyard\b|\breanimate\b", "Recursion"),
    (r"\bsacrifice\b", "Sacrifice"),
    (r"\b(?:add|adds) \{", "Ramp"),
    (r"\bsearch your library for a.*land\b", "Ramp"),
    (r"\bgain.*life\b|\blifelink\b", "Lifegain"),
    (r"\bmutate\b", "Mutate"),
    (r"\bdredge\b|\bmill\b", "Graveyard fill"),
]


def _classify_roles(card: dict | None) -> list[str]:
    """Tag a card with its functional roles (draw, removal, ramp, etc.)."""
    if not card:
        return []
    roles: list[str] = []

    # 1. Theme preset matchers (from composition system)
    for preset_key, label in _ROLE_CHECKS:
        try:
            matcher = get_preset(preset_key)
            if matcher.matches(card):
                if label not in roles:
                    roles.append(label)
        except Exception:
            pass

    # 2. Oracle text pattern matching for roles without presets
    oracle = (card.get("oracle_text") or "").lower()
    for pattern, label in _ORACLE_ROLES:
        if label not in roles and re.search(pattern, oracle, re.IGNORECASE):
            roles.append(label)

    # 3. Type-line based roles
    type_line = (card.get("type_line") or "").lower()
    if "land" in type_line and "Land" not in roles:
        roles.append("Land")
    if "creature" in type_line and not roles:
        roles.append("Creature")
    if "planeswalker" in type_line:
        roles.append("Planeswalker")

    return roles[:3]


def _enrich_card(card_dict: dict, idx: Any) -> dict:
    """Add role tags to a card entry by looking up its Scryfall record."""
    name = card_dict.get("name", "")
    rec = idx.get(name)
    card_dict["roles"] = _classify_roles(rec)
    return card_dict


def wizard_build_skeleton(
    commander: str, *, fmt: str = "commander", bracket: int | None = None,
) -> dict[str, Any]:
    """Step 1: Given a commander, build a starter skeleton using EDHREC data
    and staple card search. Returns categorized card suggestions.
    """
    idx = _bulk_index()
    cmd_rec = idx.get(commander)
    if not cmd_rec:
        return {"error": True, "message": f"Commander not found: {commander}"}

    color_identity = cmd_rec.get("color_identity", [])
    ci_str = "".join(color_identity) or "C"
    cmd_oracle = cmd_rec.get("oracle_text", "")
    cmd_type = cmd_rec.get("type_line", "")
    cmd_keywords = cmd_rec.get("keywords", [])

    skeleton: dict[str, list[dict]] = {}

    # 1. EDHREC recommendations (the primary source)
    try:
        edhrec_cats = edhrec_lookup([commander])
        for cat_key in ["high_synergy", "top_cards", "creatures", "instants",
                        "sorceries", "artifacts", "enchantments", "lands"]:
            cards = edhrec_cats.get(cat_key, [])
            if cards:
                enriched = []
                for c in cards[:15]:
                    name = c.get("name", "")
                    if not name or not idx.get(name):
                        continue
                    enriched.append(_enrich_card(
                        {"name": name, "synergy": c.get("synergy"),
                         "num_decks": c.get("num_decks"), "potential_decks": c.get("potential_decks")},
                        idx,
                    ))
                    if len(enriched) >= 12:
                        break
                if enriched:
                    skeleton[cat_key] = enriched
    except Exception:
        pass

    # 2. Mana base: basic lands + command tower + color-fixing
    lands = ["Command Tower"]
    basics_by_color = {"W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"}
    for c in color_identity:
        b = basics_by_color.get(c)
        if b:
            lands.append(b)
    skeleton["suggested_lands"] = [
        _enrich_card({"name": n, "reason": "staple"}, idx) for n in lands
    ]

    # 3. Universal staples (ramp + draw)
    staples = []
    staple_names = ["Sol Ring", "Arcane Signet"]
    if "G" in color_identity:
        staple_names.extend(["Cultivate", "Kodama's Reach", "Rampant Growth"])
    if "B" in color_identity:
        staple_names.extend(["Night's Whisper", "Sign in Blood"])
    if "W" in color_identity:
        staple_names.extend(["Swords to Plowshares", "Path to Exile"])
    for name in staple_names:
        rec = idx.get(name)
        if rec:
            staples.append(_enrich_card({"name": rec.get("name", name), "reason": "format staple"}, idx))
    skeleton["staples"] = staples

    return {
        "error": False,
        "commander": {
            "name": cmd_rec.get("name", commander),
            "oracle_text": cmd_oracle,
            "type_line": cmd_type,
            "color_identity": color_identity,
            "keywords": cmd_keywords,
            "mana_cost": cmd_rec.get("mana_cost", ""),
        },
        "skeleton": skeleton,
        "bracket": bracket,
    }


def wizard_narrate(
    commander_name: str, category: str, card_names: list[str],
    current_decklist: str, *, api_key: str | None = None,
) -> dict[str, Any]:
    """Have the AI explain why a batch of suggested cards fits this deck."""
    idx = _bulk_index()
    cmd_rec = idx.get(commander_name)
    cmd_oracle = (cmd_rec or {}).get("oracle_text", "")
    cmd_type = (cmd_rec or {}).get("type_line", "")

    card_details = []
    for name in card_names[:10]:
        rec = idx.get(name)
        if rec:
            card_details.append(f"- {rec.get('name', name)}: {rec.get('oracle_text', '')}")
        else:
            card_details.append(f"- {name}")

    user_msg = (
        f"Commander: {commander_name} ({cmd_type})\n"
        f"Oracle: {cmd_oracle}\n\n"
        f"Category being filled: {category}\n\n"
        f"Suggested cards:\n" + "\n".join(card_details)
    )

    resp = _ai_call(_WIZARD_NARRATE, user_msg, api_key=api_key, max_tokens=500)
    if resp["error"]:
        return {"error": True, "message": resp["result"]}
    return {"error": False, "narration": resp["result"], "model": resp.get("model")}


def wizard_chat(
    messages: list[dict], commander_name: str, current_decklist: str,
    *, fmt: str = "commander", bracket: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Free-form conversational deck building (requires Sonnet-class model).

    Takes a conversation history and returns the AI's next response.
    This is the 'lights up with Sonnet' path.
    """
    import anthropic

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {"error": True, "message": "No API key available."}

    # Check if we have a Sonnet-class model available
    client = anthropic.Anthropic(api_key=key)
    sonnet_models = [
        "claude-sonnet-4-5-20250514",
        "claude-3-5-sonnet-20241022",
        "claude-3-7-sonnet-20250219",
    ]
    model = None
    for m in sonnet_models:
        try:
            client.messages.create(model=m, max_tokens=5,
                                   messages=[{"role": "user", "content": "hi"}])
            model = m
            break
        except Exception:
            continue

    if not model:
        return {
            "error": True,
            "requires_sonnet": True,
            "message": "Conversational mode requires a Sonnet-class model. Your API key only has access to Haiku. Use the guided wizard instead, or upgrade your API plan.",
        }

    # Build rich context
    ctx = _deck_context_cached(current_decklist, fmt, bracket=bracket) if current_decklist.strip() else None
    system = (
        "You are an expert MTG deck builder having a conversation about building a Commander deck. "
        "You have deep knowledge of card synergies, archetypes, and the Commander format. "
        f"The commander is {commander_name}. "
        + (f"Target bracket: {bracket}. " if bracket else "")
        + "When suggesting cards, explain WHY they fit. Be specific about synergies with the commander. "
        "Keep responses concise (3-5 sentences per suggestion). "
        "You can suggest additions, cuts, strategy shifts, or answer rules questions."
    )
    if ctx:
        system += f"\n\nCurrent deck context:\n{ctx['summary']}"

    try:
        response = client.messages.create(
            model=model, max_tokens=2000, system=system, messages=messages,
        )
        return {
            "error": False,
            "response": response.content[0].text,
            "model": model,
        }
    except Exception as exc:
        return {"error": True, "message": f"AI request failed: {exc}"}


# --------------------------------------------------------------------------- #
# AI Rules Q&A (Phase 2 — lightweight RAG over Comprehensive Rules + cards)
# --------------------------------------------------------------------------- #
_RULES_QA_MODEL = _AI_MODEL
_RULES_QA_MAX_TOKENS = 1500
_RULES_QA_GREP_LIMIT = 40

_RULES_SYSTEM = """You are an expert Magic: The Gathering rules judge. Answer the user's question using the card oracle text and Comprehensive Rules excerpts provided below. Be precise and cite specific rule numbers (e.g. "Rule 702.19a") in your answer.

Structure your response as:
1. A clear, direct answer in plain English (2-4 sentences).
2. A brief explanation referencing the relevant rules and card text.

You may use your knowledge of MTG rules to reason about interactions, but cite rule numbers from the provided excerpts when possible. If the provided rules don't cover a specific mechanic, say which rule area would be relevant."""

_STOP_WORDS = {
    "a", "an", "the", "is", "are", "can", "do", "does", "how", "what",
    "when", "where", "why", "if", "i", "my", "of", "to", "in", "on",
    "it", "its", "and", "or", "not", "with", "for", "be", "this",
    "that", "have", "has", "from", "at", "by", "but", "about", "get",
    "gets", "his", "her", "he", "she", "they", "their", "would",
    "could", "should", "will", "does", "did", "was", "were",
}


def _extract_search_terms(question: str) -> list[str]:
    words = re.findall(r"[a-zA-Z'-]+", question.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) > 2]


def _find_cards_in_question(question: str) -> list[dict]:
    """Detect card names mentioned in the question by searching the bulk index.

    Strategy: try progressively shorter multi-word windows from the question
    against the card search. Return cards found with their oracle text.
    """
    idx = _bulk_index()
    words = re.findall(r"[A-Za-z',]+", question)
    found: dict[str, dict] = {}

    # Try multi-word windows (longest first: 5 words down to 2)
    for window in range(min(5, len(words)), 1, -1):
        for i in range(len(words) - window + 1):
            candidate = " ".join(words[i : i + window])
            if len(candidate) < 4:
                continue
            # Skip if this is a subset of an already-found card
            if any(candidate.lower() in name.lower() for name in found):
                continue
            try:
                results = _search_cards(
                    config.BULK_PATH, name=candidate, limit=1
                )
            except Exception:
                continue
            for card in results:
                name = card.get("name", "")
                if name and name not in found:
                    # Verify the candidate is a reasonable match (not just a common word)
                    name_words = {w.lower().rstrip(",") for w in name.split()}
                    cand_words = {w.lower().rstrip(",") for w in candidate.split()}
                    if cand_words & name_words:
                        found[name] = card

    return list(found.values())[:5]


def _gather_rules_context(
    question: str, cards: list[dict]
) -> tuple[str, list[dict], str]:
    """Retrieve relevant rules via grep + glossary, enriched with card keywords.

    Returns (context_text, cited_rules_list, cards_text).
    """
    parsed = _rules()
    terms = _extract_search_terms(question)
    glossary = parsed.get("glossary", {})

    # Extract additional search terms from card oracle text and keywords
    card_terms: list[str] = []
    for card in cards:
        for kw in card.get("keywords", []):
            card_terms.append(kw.lower())
        oracle = card.get("oracle_text", "")
        # Pull mechanically significant phrases from oracle text
        for phrase in re.findall(
            r"(?:enters the battlefield|dies|leaves.*?graveyard|"
            r"put into.*?graveyard|cast.*?spell|triggered ability|"
            r"mutate[sd]?|whenever|at the beginning|sacrifice|exile|"
            r"counter target|return.*?from.*?graveyard)", oracle, re.IGNORECASE
        ):
            card_terms.append(phrase.lower().strip())

    all_terms = list(dict.fromkeys(terms + card_terms))

    seen_numbers: set[str] = set()
    cited: list[dict] = []

    def _add_rule(number: str, source: str) -> None:
        if number in seen_numbers or len(cited) >= _RULES_QA_GREP_LIMIT:
            return
        rule = lookup_rule(parsed, number)
        if not rule:
            return
        seen_numbers.add(number)
        cited.append({
            "number": rule["number"],
            "text": rule.get("text") or rule.get("title", ""),
            "source": source,
        })

    # 1. Glossary hits
    for t in all_terms:
        entry = glossary.get(t)
        if entry:
            cited.append({
                "number": f"Glossary: {entry['term']}",
                "text": entry["definition"],
                "source": "glossary",
            })
            for rn in entry.get("see_rules", []):
                _add_rule(rn, "glossary_ref")

    # 2. Key rule sections that are almost always relevant for interaction questions
    if cards:
        for section in ["603.1", "603.2", "603.3", "603.3a", "603.3b",
                         "603.6", "603.6a", "603.10",
                         "614.1", "614.1a",
                         "701.34a",
                         "113.1", "113.3", "113.3a", "113.3b"]:
            _add_rule(section, "core")

    # 3. Grep for mechanically significant phrases from card text
    grep_budget = _RULES_QA_GREP_LIMIT - len(cited)
    per_term = max(3, grep_budget // max(len(all_terms), 1))
    for t in all_terms:
        if len(t) < 3 or len(cited) >= _RULES_QA_GREP_LIMIT:
            break
        try:
            hits = grep_rules(parsed, re.escape(t), limit=per_term)
        except re.error:
            continue
        for hit in hits:
            _add_rule(hit["number"], "grep")

    # Build cards context block
    card_lines = []
    for card in cards:
        card_lines.append(
            f"**{card['name']}** ({card.get('mana_cost', '')}) — "
            f"{card.get('type_line', '')}\n{card.get('oracle_text', '')}"
        )
    cards_text = "\n\n".join(card_lines) if card_lines else ""

    # Build rules context block
    rule_lines = [f"[{c['number']}] {c['text']}" for c in cited]
    rules_text = "\n\n".join(rule_lines) if rule_lines else "(No matching rules found.)"

    return rules_text, cited, cards_text


def rules_ask(question: str, *, api_key: str | None = None) -> dict[str, Any]:
    """Answer a plain-English MTG rules question using RAG over the CR + card data.

    Key resolution: uses the caller's API key if provided, otherwise falls back
    to the owner's ANTHROPIC_API_KEY env var. Returns an error if neither is set.
    """
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {
            "error": True,
            "answer": "No API key available. Add your Anthropic API key in Settings, or ask the site owner to configure one.",
            "citations": [],
        }

    # 1. Detect cards mentioned in the question
    cards = _find_cards_in_question(question)

    # 2. Gather rules context (enriched with card keywords)
    rules_context, cited, cards_text = _gather_rules_context(question, cards)

    # 3. Build the prompt
    sections = []
    if cards_text:
        sections.append(f"## Cards mentioned\n\n{cards_text}")
    sections.append(f"## Comprehensive Rules excerpts\n\n{rules_context}")
    sections.append(f"## Question\n\n{question}")
    user_msg = "\n\n".join(sections)

    resp = _ai_call(_RULES_SYSTEM, user_msg, api_key=key, max_tokens=_RULES_QA_MAX_TOKENS)
    if resp["error"]:
        return {"error": True, "answer": resp["result"], "citations": []}

    answer = resp["result"]
    answer_refs = set(re.findall(r"\b(\d{3}(?:\.\d+[a-z]?)?)\b", answer))
    citations = []
    seen_cit: set[str] = set()
    for c in cited:
        num = c["number"].split(": ")[-1] if c["number"].startswith("Glossary") else c["number"]
        if num in seen_cit:
            continue
        if num in answer_refs or c["source"] == "glossary":
            seen_cit.add(num)
            citations.append({"number": c["number"], "text": c["text"]})

    return {
        "error": False,
        "answer": answer,
        "citations": citations,
        "cards": [{"name": c["name"], "oracle_text": c.get("oracle_text", "")} for c in cards],
        "model": resp.get("model"),
        "rules_searched": len(cited),
    }
