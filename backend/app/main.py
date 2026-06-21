"""FastAPI entry point for the MTG web app (Phase 1: deterministic features).

Endpoints:
  GET  /api/health                 — liveness + whether heavy data loaded
  GET  /api/rules/search           — Comprehensive Rules lookup (rule | term | grep)
  GET  /api/cards/search           — card search over Scryfall bulk data
  POST /api/deck/analyze           — parse a decklist + run stats/mana/legality/bracket

Run locally:  uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app import config, mtg

log = logging.getLogger("mtg-web")

_warmed = False

# ---------------------------------------------------------------------------
# Role-based AI rate limiting
# ---------------------------------------------------------------------------
_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "ANDRES.J.MARTINEZ@outlook.com").lower()
_AI_RATE_LIMIT = int(os.environ.get("AI_RATE_LIMIT_PER_DAY", "25"))
_AI_MONTHLY_BUDGET_CENTS = int(os.environ.get("AI_MONTHLY_BUDGET_CENTS", "1000"))

_daily_usage: dict[str, dict] = {}   # email -> {count, date}
_USAGE_FILE = Path(os.environ.get("AI_USAGE_FILE", "ai_usage.json"))

# Sonnet pricing per 1M tokens (cents)
_INPUT_COST_CENTS_PER_M = 300    # $3/M input
_OUTPUT_COST_CENTS_PER_M = 1500  # $15/M output


def _load_monthly_usage() -> dict:
    try:
        if _USAGE_FILE.exists():
            data = json.loads(_USAGE_FILE.read_text())
            if data.get("month") == datetime.date.today().strftime("%Y-%m"):
                return data
    except Exception:
        pass
    return {"month": datetime.date.today().strftime("%Y-%m"), "total_cents": 0.0, "calls": 0}


def _save_monthly_usage(data: dict) -> None:
    try:
        _USAGE_FILE.write_text(json.dumps(data))
    except Exception:
        log.warning("Could not save AI usage file.")


def _record_ai_usage(input_tokens: int, output_tokens: int) -> None:
    data = _load_monthly_usage()
    cost = (input_tokens / 1_000_000 * _INPUT_COST_CENTS_PER_M
            + output_tokens / 1_000_000 * _OUTPUT_COST_CENTS_PER_M)
    data["total_cents"] = data.get("total_cents", 0) + cost
    data["calls"] = data.get("calls", 0) + 1
    _save_monthly_usage(data)


def _get_user_role(request: Request) -> tuple[str, str]:
    """Returns (role, email). Role is 'admin', 'member', or 'anonymous'."""
    email = (request.headers.get("X-User-Email") or "").strip().lower()
    if not email:
        return "anonymous", ""
    if email == _ADMIN_EMAIL:
        return "admin", email
    return "member", email


def _check_ai_access(request: Request, visitor_key: str | None = None) -> None:
    """Gate AI endpoints: check role, daily rate limit, and monthly budget.
    Visitor API keys bypass all checks. Anonymous users are allowed when
    the server has ANTHROPIC_API_KEY set, rate-limited by IP.
    """
    if visitor_key:
        return

    # Must have a server-side key for AI to work at all
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "AI features are not configured on this server.")

    role, email = _get_user_role(request)

    # Monthly budget check (applies to everyone)
    usage = _load_monthly_usage()
    if usage.get("total_cents", 0) >= _AI_MONTHLY_BUDGET_CENTS:
        raise HTTPException(429, "AI budget reached for this month. Deterministic features still work.")

    # Admin bypasses daily limit
    if role == "admin":
        return

    # Rate limit by email (signed in) or IP (anonymous)
    limit_key = email if email else (request.client.host if request.client else "unknown")
    today = datetime.date.today().isoformat()
    user_usage = _daily_usage.get(limit_key, {})
    if user_usage.get("date") != today:
        user_usage = {"date": today, "count": 0}
    if user_usage["count"] >= _AI_RATE_LIMIT:
        raise HTTPException(429, f"Daily AI limit reached ({_AI_RATE_LIMIT} calls/day). Try again tomorrow.")
    user_usage["count"] += 1
    _daily_usage[limit_key] = user_usage


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Warm the heavy indexes at startup so the first request is fast.

    Best-effort: if data files are missing in a given environment, the server still
    boots and individual endpoints surface a clear error.
    """
    global _warmed
    mtg.on_ai_usage = _record_ai_usage
    try:
        mtg.warm()
        _warmed = True
        log.info("Warmed bulk index + rules.")
    except Exception:  # noqa: BLE001 - boot resilience; endpoints re-raise with detail
        log.exception("Warm-up failed; endpoints will load lazily / error per-request.")
    yield


app = FastAPI(title="MTG Web API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-User-Email"],
)


@app.get("/api/health")
def health() -> dict:
    usage = _load_monthly_usage()
    budget_pct = max(0, 100 - int(usage.get("total_cents", 0) / max(_AI_MONTHLY_BUDGET_CENTS, 1) * 100))
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {
        "status": "ok",
        "warmed": _warmed,
        "data_as_of": mtg.data_as_of(),
        "ai_available": has_key and budget_pct > 0,
        "ai_budget_remaining_pct": budget_pct,
        "ai_calls_this_month": usage.get("calls", 0),
    }


@app.get("/api/rules/search")
def rules_search(
    rule: Annotated[str | None, Query(description="Exact rule number, e.g. 702.19a")] = None,
    term: Annotated[str | None, Query(description="Glossary term, e.g. trample")] = None,
    grep: Annotated[str | None, Query(description="Regex over rule text")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict:
    if sum(bool(x) for x in (rule, term, grep)) != 1:
        raise HTTPException(400, "Provide exactly one of: rule, term, grep")
    try:
        return mtg.rules_search(rule=rule, term=term, grep=grep, limit=limit)
    except FileNotFoundError as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/cards/search")
def cards_search(
    name: Annotated[str | None, Query(description="Name substring")] = None,
    oracle: Annotated[str | None, Query(description="Regex over oracle text")] = None,
    type: Annotated[str | None, Query(alias="type", description="Type-line substring")] = None,  # noqa: A002
    color_identity: Annotated[str | None, Query(description="e.g. WUG; C for colorless")] = None,
    cmc_min: float | None = None,
    cmc_max: float | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    fmt: Annotated[str | None, Query(alias="format", description="Format legality filter")] = None,
    sort: str = "price-desc",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> dict:
    try:
        results = mtg.card_search(
            name=name,
            oracle=oracle,
            card_type=type,
            color_identity=color_identity,
            cmc_min=cmc_min,
            cmc_max=cmc_max,
            price_min=price_min,
            price_max=price_max,
            format=fmt,
            sort=sort,
            limit=limit,
        )
    except Exception as e:  # noqa: BLE001 - surface filter/regex errors cleanly
        raise HTTPException(400, str(e)) from e
    return {"count": len(results), "results": results}


@app.post("/api/deck/analyze")
def deck_analyze(
    payload: Annotated[dict, Body(example={"decklist": "1 Sol Ring\n1 Llanowar Elves", "format": "commander"})],
) -> dict:
    decklist = (payload.get("decklist") or "").strip()
    fmt = payload.get("format") or "commander"
    if not decklist:
        raise HTTPException(400, "Body must include a non-empty 'decklist' string.")
    try:
        return mtg.analyze_deck(decklist, fmt=fmt)
    except KeyError as e:
        raise HTTPException(400, f"Unknown format: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


@app.post("/api/deck/export")
def deck_export(
    payload: Annotated[dict, Body(example={"decklist": "1 Sol Ring", "format": "commander"})],
) -> dict:
    """Normalize any pasted decklist into canonical Archidekt/Moxfield import text."""
    decklist = (payload.get("decklist") or "").strip()
    fmt = payload.get("format") or "commander"
    if not decklist:
        raise HTTPException(400, "Body must include a non-empty 'decklist' string.")
    try:
        return {"format": fmt, "text": mtg.export_deck_text(decklist, fmt=fmt)}
    except KeyError as e:
        raise HTTPException(400, f"Unknown format: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


def _decklist_and_format(payload: dict) -> tuple[str, str]:
    decklist = (payload.get("decklist") or "").strip()
    if not decklist:
        raise HTTPException(400, "Body must include a non-empty 'decklist' string.")
    return decklist, payload.get("format") or "commander"


@app.post("/api/deck/recommend")
def deck_recommend(payload: Annotated[dict, Body()]) -> dict:
    """EDHREC recommendations for the deck's commander(s) (build helper)."""
    decklist, fmt = _decklist_and_format(payload)
    try:
        return mtg.deck_recommendations(decklist, fmt=fmt)
    except KeyError as e:
        raise HTTPException(400, f"Unknown format: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


@app.post("/api/deck/combos")
def deck_combos(payload: Annotated[dict, Body()]) -> dict:
    """Combos in the deck + near-misses one card away (Commander Spellbook)."""
    decklist, fmt = _decklist_and_format(payload)
    try:
        return mtg.deck_combos(decklist, fmt=fmt)
    except KeyError as e:
        raise HTTPException(400, f"Unknown format: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


@app.post("/api/deck/composition")
def deck_composition(payload: Annotated[dict, Body()]) -> dict:
    """Category counts vs Commander rules-of-thumb (the 'what's missing' view)."""
    decklist, fmt = _decklist_and_format(payload)
    try:
        return mtg.deck_composition(decklist, fmt=fmt)
    except KeyError as e:
        raise HTTPException(400, f"Unknown format: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


def _visitor_key(payload: dict) -> str | None:
    return (payload.get("api_key") or "").strip() or None


def _target_bracket(payload: dict) -> int | None:
    b = payload.get("bracket")
    return int(b) if b is not None else None


@app.post("/api/deck/ai/cuts")
def deck_ai_cuts(request: Request, payload: Annotated[dict, Body()]) -> dict:
    _check_ai_access(request, _visitor_key(payload))
    decklist, fmt = _decklist_and_format(payload)
    return mtg.ai_suggest_cuts(
        decklist, fmt=fmt, bracket=_target_bracket(payload), api_key=_visitor_key(payload)
    )


@app.post("/api/deck/ai/fills")
def deck_ai_fills(request: Request, payload: Annotated[dict, Body()]) -> dict:
    _check_ai_access(request, _visitor_key(payload))
    decklist, fmt = _decklist_and_format(payload)
    return mtg.ai_composition_fills(
        decklist, fmt=fmt, bracket=_target_bracket(payload), api_key=_visitor_key(payload)
    )


@app.post("/api/deck/ai/explain")
def deck_ai_explain(request: Request, payload: Annotated[dict, Body()]) -> dict:
    _check_ai_access(request, _visitor_key(payload))
    decklist, fmt = _decklist_and_format(payload)
    card_names = payload.get("card_names") or []
    if not card_names:
        raise HTTPException(400, "Provide a 'card_names' list.")
    return mtg.ai_explain_recommendations(
        decklist, card_names, fmt=fmt, bracket=_target_bracket(payload), api_key=_visitor_key(payload)
    )


@app.post("/api/deck/ai/combos")
def deck_ai_combos(request: Request, payload: Annotated[dict, Body()]) -> dict:
    _check_ai_access(request, _visitor_key(payload))
    decklist, fmt = _decklist_and_format(payload)
    combos_data = payload.get("combos") or []
    near_misses = payload.get("near_misses") or []
    return mtg.ai_combo_guidance(
        decklist, combos_data, near_misses, fmt=fmt,
        bracket=_target_bracket(payload), api_key=_visitor_key(payload),
    )


@app.post("/api/deck/wizard/skeleton")
def wizard_skeleton(payload: Annotated[dict, Body()]) -> dict:
    """Build a starter skeleton for a commander (EDHREC + staples)."""
    commander = (payload.get("commander") or "").strip()
    if not commander:
        raise HTTPException(400, "Provide a 'commander' name.")
    fmt = payload.get("format") or "commander"
    bracket = _target_bracket(payload)
    return mtg.wizard_build_skeleton(commander, fmt=fmt, bracket=bracket)


@app.post("/api/deck/wizard/narrate")
def wizard_narrate(request: Request, payload: Annotated[dict, Body()]) -> dict:
    """AI narration: explain why suggested cards fit the deck."""
    _check_ai_access(request, _visitor_key(payload))
    commander = (payload.get("commander") or "").strip()
    category = payload.get("category") or ""
    card_names = payload.get("card_names") or []
    decklist = payload.get("decklist") or ""
    if not commander or not card_names:
        raise HTTPException(400, "Provide 'commander' and 'card_names'.")
    return mtg.wizard_narrate(
        commander, category, card_names, decklist, api_key=_visitor_key(payload)
    )


@app.post("/api/deck/wizard/chat")
def wizard_chat(request: Request, payload: Annotated[dict, Body()]) -> dict:
    """Free-form conversational deck building (requires Sonnet)."""
    _check_ai_access(request, _visitor_key(payload))
    commander = (payload.get("commander") or "").strip()
    messages = payload.get("messages") or []
    decklist = payload.get("decklist") or ""
    fmt = payload.get("format") or "commander"
    if not commander or not messages:
        raise HTTPException(400, "Provide 'commander' and 'messages'.")
    return mtg.wizard_chat(
        messages, commander, decklist, fmt=fmt,
        bracket=_target_bracket(payload), api_key=_visitor_key(payload),
    )


@app.get("/api/cards/image")
def card_image(
    name: Annotated[str | None, Query(description="Single card name")] = None,
    names: Annotated[str | None, Query(description="Pipe-separated card names for a batch")] = None,
) -> dict:
    """Resolve card name(s) to Scryfall image URLs (for hover/tap previews).

    `?name=Sol Ring` → {name, found, image, thumb}.
    `?names=A|B|C`   → {"images": {A: {...}, B: {...}, ...}}.
    """
    if names:
        wanted = [n.strip() for n in names.split("|") if n.strip()]
        return {"images": mtg.card_images(wanted)}
    if name:
        return mtg.card_image(name)
    raise HTTPException(400, "Provide 'name' or 'names'.")


@app.post("/api/rules/ask")
def rules_ask(
    request: Request,
    payload: Annotated[dict, Body(example={"question": "Can I counter a triggered ability?"})],
) -> dict:
    """AI Rules Q&A: answer a plain-English MTG rules question with cited rules."""
    visitor_key = _visitor_key(payload)
    _check_ai_access(request, visitor_key)
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "Body must include a non-empty 'question' string.")
    return mtg.rules_ask(question, api_key=visitor_key)


@app.post("/api/rules/ask/stream")
def rules_ask_stream(
    request: Request,
    payload: Annotated[dict, Body()],
):
    """Streaming AI Rules Q&A — answer appears word-by-word via SSE."""
    visitor_key = _visitor_key(payload)
    _check_ai_access(request, visitor_key)
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "Body must include a non-empty 'question' string.")

    key = visitor_key or os.environ.get("ANTHROPIC_API_KEY")
    cards = mtg._find_cards_in_question(question)
    rules_context, cited, cards_text = mtg._gather_rules_context(question, cards)
    sections = []
    if cards_text:
        sections.append(f"## Cards mentioned\n\n{cards_text}")
    sections.append(f"## Comprehensive Rules excerpts\n\n{rules_context}")
    sections.append(f"## Question\n\n{question}")
    user_msg = "\n\n".join(sections)

    import json as _json
    def generate():
        yield from mtg._ai_call_stream(mtg._RULES_SYSTEM, user_msg, api_key=key, max_tokens=1500)
        # Send citations as final metadata
        yield f"data: {_json.dumps({'status': 'citations', 'citations': [{'number': c['number'], 'text': c['text']} for c in cited], 'cards': [{'name': c['name'], 'oracle_text': c.get('oracle_text', '')} for c in cards]})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/commanders/search")
def commanders_search(
    q: Annotated[str, Query(min_length=2, description="Partial commander name")],
    limit: Annotated[int, Query(ge=1, le=25)] = 12,
) -> dict:
    """Resolve a typed name to commander-eligible cards (e.g. 'nethroi')."""
    try:
        return {"results": mtg.commander_search(q, limit=limit)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e)) from e
