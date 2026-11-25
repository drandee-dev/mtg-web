"""Self-check for a dead usage database. Run: python test_usage_resilience.py

Reproduces 2026-11-25: the Supabase project was paused, each usage query answered
after about 7 s, /api/health took 14 s (the page gives up at 8 and says "Server
unreachable") and every AI call waited on up to four of them. A query now gets
1.5 s, and after one failure nothing is asked for a minute.
"""

import sys
import time

sys.path.insert(0, ".")
from fastapi.testclient import TestClient  # noqa: E402

from app import usage  # noqa: E402
from app.main import app  # noqa: E402

HANG = 3.0  # longer than the limit, short enough that the script still exits soon


class Resp:
    def __init__(self, data, count):
        self.data, self.count = data, count


class FakeClient:
    """Stands in for the Supabase client: any chain of calls ends in execute()."""

    def __init__(self, behave):
        self.behave, self.calls = behave, 0

    def __getattr__(self, name):  # table / select / eq / gte / insert
        return lambda *a, **k: self

    def execute(self):
        self.calls += 1
        return self.behave()


def use(client):
    usage._client = client
    usage._down_until = 0.0
    return client


def healthy():
    return Resp([{"cost_cents": 1.5}, {"cost_cents": 2.5}], 2)


def hang():
    time.sleep(HANG)
    return healthy()


def boom():
    raise ConnectionError("project paused")


def test_healthy_database_is_read_in_one_query():
    c = use(FakeClient(healthy))
    assert usage.monthly_usage() == (4.0, 2, "ok")
    assert c.calls == 1, c.calls
    assert usage.daily_call_count("1.2.3.4") == 2
    # The two inserts are what the rate limit and the cap count: each must reach it.
    usage.record_attempt("1.2.3.4")
    assert c.calls == 3, c.calls

    class Tokens:
        input_tokens, output_tokens = 1000, 100

    usage.record_cost("claude-sonnet-5", Tokens())
    assert c.calls == 4, c.calls
    print("ok: a healthy database gives the month's cents and calls in one query")


def test_a_hung_query_gives_up_and_the_next_calls_do_not_ask():
    c = use(FakeClient(hang))
    t = time.monotonic()
    assert usage.monthly_usage() == (0.0, 0, "down")
    waited = time.monotonic() - t
    assert waited < HANG - 0.5, f"waited {waited:.1f}s on a hung query"
    # The back-off: an AI call makes three more usage calls; none may wait or ask.
    t = time.monotonic()
    assert usage.daily_call_count("1.2.3.4") == 0
    usage.record_attempt("1.2.3.4")
    assert usage.monthly_total_cents() == 0.0
    assert time.monotonic() - t < 0.2, "the back-off still waited"
    assert c.calls == 1, f"asked a dead database {c.calls} times"
    print(
        f"ok: a hung query gives up after {waited:.1f}s and the back-off asks nothing"
    )


def test_tracking_comes_back_after_the_back_off():
    use(FakeClient(boom))
    assert usage.monthly_usage()[2] == "down"
    c = FakeClient(healthy)
    usage._client = c
    assert usage.monthly_usage()[2] == "down", "asked again inside the back-off"
    usage._down_until = 0.0  # the minute has passed
    assert usage.monthly_usage() == (4.0, 2, "ok")
    print("ok: a failing query reads as down, and tracking returns after the back-off")


def test_no_supabase_reads_as_off():
    use(None)
    assert usage.monthly_usage() == (0.0, 0, "off")
    print("ok: with no Supabase configured tracking reads as off")


def test_health_answers_fast_and_says_tracking_is_down():
    use(FakeClient(hang))
    t = time.monotonic()
    r = TestClient(app).get("/api/health")
    waited = time.monotonic() - t
    body = r.json()
    assert r.status_code == 200 and body["status"] == "ok", body
    assert body["usage_tracking"] == "down", body
    assert waited < HANG - 0.5, f"/api/health took {waited:.1f}s"
    use(FakeClient(healthy))
    body = TestClient(app).get("/api/health").json()
    assert body["usage_tracking"] == "ok" and body["ai_calls_this_month"] == 2, body
    print(f"ok: /api/health answers in {waited:.1f}s with a hung database and says so")


if __name__ == "__main__":
    test_healthy_database_is_read_in_one_query()
    test_a_hung_query_gives_up_and_the_next_calls_do_not_ask()
    test_tracking_comes_back_after_the_back_off()
    test_no_supabase_reads_as_off()
    test_health_answers_fast_and_says_tracking_is_down()
    print("all usage resilience checks passed")
