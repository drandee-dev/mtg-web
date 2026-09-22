"""AI usage tracking backed by Supabase.

Replaces the old local ai_usage.json file so budget/rate-limit enforcement
survives server restarts — and, later, serverless invocations with no shared
disk. Two event kinds in one append-only table:

  "attempt" — logged when a request hits an AI endpoint, tagged with the
              caller's email/IP. Drives the per-user daily rate limit.
  "cost"    — logged once the AI response returns (via mtg.py's on_ai_usage
              hook), with no caller attribution. Drives the monthly budget cap.
"""

from __future__ import annotations

import datetime
import logging
import os
from typing import Any

log = logging.getLogger("mtg-web")

_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Cents per million tokens, per model. Anthropic list prices.
#
# This used to be two module constants pinned to Sonnet 4.6's $3/$15, which made
# the ledger wrong in two directions at once: a Haiku fallback response (a third
# of the price) was billed as Sonnet, and every model switch silently invalidated
# the monthly cap until someone remembered to edit these numbers.
_PRICES_CENTS_PER_M = {
    "claude-opus-5-5": (400, 2000),
    "claude-opus-5": (500, 2500),
    "claude-sonnet-5": (200, 1000),
    "claude-sonnet-4-6": (300, 1500),
    "claude-haiku-4-5": (100, 500),
}
# Unknown model: charge the most expensive rate we know rather than zero, so a
# typo in a model id overstates the bill instead of hiding it.
_FALLBACK_PRICE = max(_PRICES_CENTS_PER_M.values())

# Cache reads bill at 0.1x the input rate; the 5-minute write premium is 1.25x.
# Two models break the 0.1x rule and are cheaper on reads than the multiplier
# implies, so they need an override rather than the default.
_CACHE_READ_MULTIPLIER = 0.1
_CACHE_READ_OVERRIDES = {
    "claude-opus-5-5": 0.05,
    "claude-fable-5-1": 0.025,
}
_CACHE_WRITE_MULTIPLIER = 1.25

_client = None
if _SUPABASE_URL and _SUPABASE_SERVICE_ROLE_KEY:
    from supabase import create_client

    _client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
else:
    log.warning(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — AI usage tracking "
        "disabled; budget cap and daily rate limits will not be enforced."
    )


def _month_start() -> str:
    return datetime.date.today().replace(day=1).isoformat()


def _day_start() -> str:
    return datetime.date.today().isoformat()


def monthly_total_cents() -> float:
    # Fail open like the write paths: a Supabase outage or misconfigured key
    # must not 500 /api/health (the frontend treats that as "backend down").
    if not _client:
        return 0.0
    try:
        resp = (
            _client.table("ai_usage_events")
            .select("cost_cents")
            .eq("kind", "cost")
            .gte("created_at", _month_start())
            .execute()
        )
        return sum(row["cost_cents"] for row in resp.data)
    except Exception:
        log.exception("Usage query failed — budget cap not enforced this request.")
        return 0.0


def monthly_call_count() -> int:
    if not _client:
        return 0
    try:
        resp = (
            _client.table("ai_usage_events")
            .select("id", count="exact")
            .eq("kind", "cost")
            .gte("created_at", _month_start())
            .execute()
        )
        return resp.count or 0
    except Exception:
        log.exception("Usage query failed — reporting zero monthly calls.")
        return 0


def daily_call_count(limit_key: str) -> int:
    if not _client:
        return 0
    try:
        resp = (
            _client.table("ai_usage_events")
            .select("id", count="exact")
            .eq("kind", "attempt")
            .eq("limit_key", limit_key)
            .gte("created_at", _day_start())
            .execute()
        )
        return resp.count or 0
    except Exception:
        log.exception("Usage query failed — daily rate limit not enforced this request.")
        return 0


def record_attempt(limit_key: str) -> None:
    """Log a call attempt for daily per-user rate limiting (fires at gate-check time)."""
    if not _client:
        return
    try:
        _client.table("ai_usage_events").insert(
            {"kind": "attempt", "limit_key": limit_key}
        ).execute()
    except Exception:
        log.exception("Failed to record AI usage attempt event.")


def cost_cents(model: str, usage: Any) -> float:
    """Price one response, at its own model's rate, including cached tokens.

    `usage.input_tokens` counts only the uncached prefix: Anthropic reports cache
    reads and cache writes as separate fields. Summing input + output alone
    therefore billed the cached deck payload at zero, which is the bulk of the
    input on every deck endpoint.
    """
    in_rate, out_rate = _PRICES_CENTS_PER_M.get(model, _FALLBACK_PRICE)
    read_mult = _CACHE_READ_OVERRIDES.get(model, _CACHE_READ_MULTIPLIER)
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    return (
        usage.input_tokens / 1_000_000 * in_rate
        + read / 1_000_000 * in_rate * read_mult
        + write / 1_000_000 * in_rate * _CACHE_WRITE_MULTIPLIER
        + usage.output_tokens / 1_000_000 * out_rate
    )


def record_cost(model: str, usage: Any) -> None:
    """Log actual token cost once the AI response returns (mtg.py's on_ai_usage hook)."""
    if not _client:
        return
    cost = cost_cents(model, usage)
    try:
        _client.table("ai_usage_events").insert(
            {
                "kind": "cost",
                "cost_cents": cost,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
            }
        ).execute()
    except Exception:
        log.exception("Failed to record AI usage cost event.")
