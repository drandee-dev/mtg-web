"""Self-check: an internal KeyError never reaches the client. Run: python test_error_leaks.py

These five routes validate the format before calling into mtg, so a KeyError
inside mtg is a server bug, not bad input. They used to answer 400 "Unknown
format: '<internal key>'", leaking the key name and skipping the server log.
"""

import sys

sys.path.insert(0, ".")
from fastapi.testclient import TestClient  # noqa: E402

from app import mtg  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)
SECRET = "internal_cache_key_xyz"
ROUTES = {
    "/api/deck/analyze": "analyze_deck",
    "/api/deck/export": "export_deck_text",
    "/api/deck/recommend": "deck_recommendations",
    "/api/deck/combos": "deck_combos",
    "/api/deck/composition": "deck_composition",
}


def boom(*a, **k):
    raise KeyError(SECRET)


for path, fn in ROUTES.items():
    real = getattr(mtg, fn)
    setattr(mtg, fn, boom)
    try:
        r = client.post(path, json={"decklist": "1 Sol Ring", "format": "commander"})
    finally:
        setattr(mtg, fn, real)
    assert r.status_code == 500, (path, r.status_code, r.text)
    assert SECRET not in r.text, (path, r.text)

print(f"test_error_leaks: ok ({len(ROUTES)} routes answer an opaque 500)")
