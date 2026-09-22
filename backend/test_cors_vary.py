"""Self-check for CDN cache poisoning. Run: python test_cors_vary.py

Reproduces the production bug: a request with no Origin header (curl, a crawler,
an uptime check) used to return a cacheable response carrying neither
Access-Control-Allow-Origin nor Vary. Vercel's CDN then stored that one variant
and served it to browsers, which refused it as a CORS error even though the
endpoint returned 200 and worked fine under curl.
"""
import sys

sys.path.insert(0, ".")
from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
# Whatever this environment actually allows; hardcoding the production URL makes
# the test fail locally for a reason that has nothing to do with the bug.
BROWSER_ORIGIN = config.cors_origins()[0]

# Endpoints that set s-maxage, so the CDN stores them and Vary actually matters.
CACHED = [
    ("/api/commanders/synergies", {"name": "Atraxa, Praetors' Voice"}),
    ("/api/cards/prints", {"name": "Llanowar Elves"}),
]


def test_vary_origin_without_an_origin_header():
    """The case that poisoned the cache."""
    for path, params in CACHED:
        r = client.get(path, params=params)
        vary = r.headers.get("vary", "")
        assert "origin" in vary.lower(), f"{path} has no Vary: Origin (vary={vary!r})"
    print("ok: a no-Origin request still returns Vary: Origin")


def test_browser_request_still_gets_cors():
    for path, params in CACHED:
        r = client.get(path, params=params, headers={"Origin": BROWSER_ORIGIN})
        assert r.headers.get("access-control-allow-origin"), f"{path} lost its CORS header"
        assert "origin" in r.headers.get("vary", "").lower()
    print("ok: a browser request still gets Access-Control-Allow-Origin")


def test_vary_is_appended_not_replaced():
    """Never clobber a Vary another layer set."""
    r = client.get("/api/health")
    vary = r.headers.get("vary", "")
    assert "origin" in vary.lower()
    # nothing duplicated
    assert vary.lower().count("origin") == 1, vary
    print("ok: Vary is appended once, not duplicated")


if __name__ == "__main__":
    test_vary_origin_without_an_origin_header()
    test_browser_request_still_gets_cors()
    test_vary_is_appended_not_replaced()
    print("\nall passed")
