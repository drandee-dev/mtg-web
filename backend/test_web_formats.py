"""Self-check: the web app serves no Brawl. Run: python test_web_formats.py

Andres, 2026-10-24: "You can completely remove brawl from the web app". The UI never
offered it; the API still accepted "brawl" and "historic_brawl" because it checked
formats against the bundled mtg_utils list, which keeps Brawl for the CLI deck builder,
and several request bodies did not check the format at all. Every route that takes a
format must now refuse both, and still take the formats the UI offers.

Hermetic: TestClient only; AI access, AI calls and EDHREC are stubbed. Requests that
pass validation may still fail later for unrelated reasons; only a format refusal
(400/422 naming the format) counts as a refusal here.
"""

import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from fastapi.testclient import TestClient  # noqa: E402

from app import main, mtg  # noqa: E402

main._check_ai_access = lambda request: None
mtg._ai_call = lambda *a, **k: {"error": True, "result": "stub"}
mtg.edhrec_lookup = lambda names, timeout=None: {}
mtg.combo_search = lambda hd: {}

client = TestClient(main.app, raise_server_exceptions=False)
DECK = "Commander\n1 Silverquill, the Disputant\n\nDeck\n1 Sol Ring\n"
MSG = [{"role": "user", "content": "hi"}]

# (method, url, body builder) for every route that takes a format.
ROUTES = [
    ("post", "/api/deck/analyze", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/export", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/recommend", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/combos", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/composition", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/budget-swaps", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/validate-cards", lambda f: {"decklist": DECK, "format": f, "names": ["Sol Ring"]}),
    ("post", "/api/deck/ai/fills", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/ai/explain", lambda f: {"decklist": DECK, "format": f, "card_names": ["Sol Ring"]}),
    ("post", "/api/deck/ai/combos", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/ai/strategy", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/optimize", lambda f: {"decklist": DECK, "format": f}),
    ("post", "/api/deck/wizard/skeleton", lambda f: {"commander": "Silverquill, the Disputant", "format": f}),
    ("post", "/api/deck/wizard/chat", lambda f: {"messages": MSG, "commander": "Silverquill, the Disputant", "format": f}),
    ("post", "/api/planeswalker/chat", lambda f: {"messages": MSG, "decklist": DECK, "format": f}),
    ("post", "/api/planeswalker/chat/stream", lambda f: {"messages": MSG, "decklist": DECK, "format": f}),
]


def call(method, url, body):
    return getattr(client, method)(url, json=body)


def refused_for_format(r):
    return r.status_code in (400, 422) and "format" in r.text.lower()


for fmt in ("brawl", "historic_brawl"):
    for method, url, body in ROUTES:
        r = call(method, url, body(fmt))
        assert refused_for_format(r), f"{url} accepted {fmt}: {r.status_code} {r.text[:200]}"
    r = client.get("/api/cards/search", params={"name": "Sol", "format": fmt})
    assert r.status_code == 400, f"cards/search accepted {fmt}: {r.status_code}"
print(f"ok: {len(ROUTES) + 1} routes refuse brawl and historic_brawl")

# The UI's formats still get through format validation on every route.
for fmt in ("commander", "paupercommander", "standard", "modern", "legacy"):
    for method, url, body in ROUTES:
        r = call(method, url, body(fmt))
        assert not refused_for_format(r), f"{url} refused {fmt}: {r.status_code} {r.text[:200]}"
print("ok: commander, pauper commander, standard, modern and legacy still pass")

# The narrate route falls back to Commander for anything it does not serve.
seen = []
real_narrate = mtg.wizard_narrate
mtg.wizard_narrate = lambda *a, **k: (seen.append(k.get("fmt")), {"error": False})[1]
for fmt in ("brawl", "historic_brawl", "paupercommander"):
    client.post("/api/deck/wizard/narrate", json={"commander": "Silverquill, the Disputant", "card_names": ["Sol Ring"], "format": fmt})
mtg.wizard_narrate = real_narrate
assert seen == ["commander", "commander", "paupercommander"], seen
print("ok: narrate treats Brawl as Commander")
