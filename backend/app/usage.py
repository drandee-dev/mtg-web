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
import time
from concurrent.futures import ThreadPoolExecutor
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


# UTC, like the created_at timestamps they are compared with (and Vercel's clock).
def _month_start() -> str:
    return datetime.datetime.now(datetime.UTC).date().replace(day=1).isoformat()


def _day_start() -> str:
    return datetime.datetime.now(datetime.UTC).date().isoformat()


# A paused Supabase project answered each query after about 7 s (2026-11-25): the
# health check took 14 s and every AI call waited on up to four dead queries. So a
# query gets _QUERY_TIMEOUT, and after one failure nothing is asked for _RETRY_AFTER.
_QUERY_TIMEOUT = 1.5
_RETRY_AFTER = 60.0
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="usage")
_down_until = 0.0


def _run(what: str, query: Any) -> Any:
    """query()'s result, or None when tracking is off, backing off, slow or failing.

    Every caller fails open on None (no cap, no count): a Supabase outage must not
    take the AI features or /api/health down with it.
    """
    global _down_until
    if not _client or time.monotonic() < _down_until:
        return None
    try:
        # shortcut: the abandoned call keeps its worker until the client's own
        # timeout; the back-off keeps that to one or two at a time. Set the HTTP
        # client's timeout instead if supabase-py is ever pinned.
        return _pool.submit(query).result(timeout=_QUERY_TIMEOUT)
    except Exception:
        _down_until = time.monotonic() + _RETRY_AFTER
        log.exception(
            "Usage %s failed: tracking is off for %.0f s (no cap, no rate limit).",
            what,
            _RETRY_AFTER,
        )
        return None


def monthly_usage() -> tuple[float, int, str]:
    """(cents spent, AI calls, tracking) for this month, in one query. tracking is
    "ok", "off" (Supabase not configured) or "down" (the query failed or timed out);
    the numbers are zero unless it is "ok"."""
    if not _client:
        return 0.0, 0, "off"

    def query() -> tuple[float, int]:
        resp = (
            _client.table("ai_usage_events")
            .select("cost_cents", count="exact")
            .eq("kind", "cost")
            .gte("created_at", _month_start())
            .execute()
        )
        return sum(row["cost_cents"] for row in resp.data), resp.count or 0

    got = _run("monthly read", query)
    return (*got, "ok") if got is not None else (0.0, 0, "down")


def monthly_total_cents() -> float:
    return monthly_usage()[0]


def daily_call_count(limit_key: str) -> int:
    resp = _run(
        "daily read",
        lambda: (
            _client.table("ai_usage_events")
            .select("id", count="exact")
            .eq("kind", "attempt")
            .eq("limit_key", limit_key)
            .gte("created_at", _day_start())
            .execute()
        ),
    )
    return (resp.count or 0) if resp is not None else 0


def record_attempt(limit_key: str) -> None:
    """Log a call attempt for daily per-user rate limiting (fires at gate-check time)."""
    _run(
        "attempt write",
        lambda: (
            _client.table("ai_usage_events")
            .insert({"kind": "attempt", "limit_key": limit_key})
            .execute()
        ),
    )


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
    row = {
        "kind": "cost",
        "cost_cents": cost_cents(model, usage),
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
    }
    _run("cost write", lambda: _client.table("ai_usage_events").insert(row).execute())
