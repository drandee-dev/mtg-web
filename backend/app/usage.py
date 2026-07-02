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

log = logging.getLogger("mtg-web")

_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_INPUT_COST_CENTS_PER_M = 300
_OUTPUT_COST_CENTS_PER_M = 1500

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


def record_cost(input_tokens: int, output_tokens: int) -> None:
    """Log actual token cost once the AI response returns (mtg.py's on_ai_usage hook)."""
    if not _client:
        return
    cost = (
        input_tokens / 1_000_000 * _INPUT_COST_CENTS_PER_M
        + output_tokens / 1_000_000 * _OUTPUT_COST_CENTS_PER_M
    )
    try:
        _client.table("ai_usage_events").insert(
            {
                "kind": "cost",
                "cost_cents": cost,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
        ).execute()
    except Exception:
        log.exception("Failed to record AI usage cost event.")
