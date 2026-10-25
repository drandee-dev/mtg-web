"""Self-check: the generator's per-card price cap (max_card_price).
Run: python test_budget_cap.py

G4 (audit #10, decision 9 and 45-50). A "Bracket 2" build priced at $454 with no
way to say "nothing over $5". The cap is per card, not a deck total. Skeleton
cards over it (or unpriced) come back flagged over_cap rather than dropped, so
the collection route can keep the ones the user owns; each EDHREC list is
walked past its usual 12 for cheaper cards; a budget_picks category tops up
what that leaves short, the lists' own leftovers before generic most-played
cards; fills search under the same cap.

Uses the real bulk on disk, so the fixture is built from today's prices rather
than hardcoded ones. No network (sockets are disabled below) and no AI call.
"""

import os
import socket
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from fastapi.testclient import TestClient  # noqa: E402

from app import main, mtg  # noqa: E402


def _no_network(*a, **k):
    raise AssertionError("network call in an offline test")


_real_socket = socket.socket
socket.socket = _no_network  # type: ignore[assignment,misc]
os.environ.pop("ANTHROPIC_API_KEY", None)
mtg.combo_search = lambda hd: {}
idx = mtg._bulk_index()

CMD = "Krenko, Mob Boss"  # mono-red
CAP = 2.0
STAPLES = {"Sol Ring", "Arcane Signet"}


def price(name):
    return mtg.extract_price(idx.get(name))


def is_gc(name):
    return bool(idx.get(name).get("game_changer"))


# --- the unit rule ----------------------------------------------------------- #
assert mtg._over_cap({"prices": {"usd": "2.01"}}, 2.0)
assert not mtg._over_cap({"prices": {"usd": "2.00"}}, 2.0)  # at the cap is fine
assert mtg._over_cap({"prices": {}}, 2.0)  # no price: can't promise it's under
assert mtg._over_cap(None, 2.0)
assert not mtg._over_cap({"prices": {"usd": "999"}}, None)  # no cap, nothing over
# A basic land with no price is not over a cap: production had none for Forest,
# Mountain, Plains and Swamp, and that is a data gap, not a dear card. A priced
# basic obeys the cap like anything else (a snow basic can cost over $1).
assert not mtg._over_cap({"type_line": "Basic Land — Forest", "prices": {}}, 0.01)
assert mtg._over_cap(
    {"type_line": "Basic Snow Land — Island", "prices": {"usd": "3"}}, 1.0
)
assert not mtg._over_cap(
    {"type_line": "Basic Snow Land — Island", "prices": {"usd": "1"}}, 1.0
)

# --- fixture: a list whose top is dear, with cheap cards further down --------- #
most_played = [
    c["name"]
    for c in mtg._search_cards(
        config.BULK_PATH,
        color_identity="R",
        format="commander",
        sort="edhrec-desc",
        limit=800,
    )
    if not mtg._land_flag(c)
    and not c.get("game_changer")
    and c["name"] not in STAPLES
    and c["name"] != CMD
    and price(c["name"]) is not None
]


def canon(name):
    return idx.get(name)["name"]


*DEAR, DEAR_DEEP = [n for n in most_played if price(n) > CAP][:9]
cheap_all = [n for n in most_played if price(n) <= CAP]
# EDHREC names a two-faced card by its front face, search by "Front // Back".
TWO_FACED = next(n for n in cheap_all if " // " in n and canon(n.split(" // ")[0]) == n)
FRONT = TWO_FACED.split(" // ")[0]
CHEAP = [FRONT, *[n for n in cheap_all if n != TWO_FACED][:19]]
assert len(DEAR) == 8 and len(CHEAP) == 20, (len(DEAR), len(CHEAP))
# Eight dear cards fill most of the usual window; one more sits past it.
LISTED = [*DEAR, "Not A Real Card", *CHEAP[:6], DEAR_DEEP, *CHEAP[6:]]


def listing(card_names):
    return [
        {"name": n, "synergy": 0.1, "num_decks": 5000 - i, "potential_decks": 10000}
        for i, n in enumerate(card_names)
    ]


edhrec = {"creatures": listing(LISTED)}
mtg.edhrec_lookup = lambda names, timeout=None:edhrec


def skeleton(cap, bracket=2):
    r = mtg.wizard_build_skeleton(CMD, bracket=bracket, max_card_price=cap)
    assert not r["error"], r
    return r["skeleton"]


def names(cards):
    return [c["name"] for c in cards]


# --- no cap: the response is what it was, plus price_usd ---------------------- #
sk = skeleton(None)
# First 12 valid cards of the first 15 listed, dear ones included.
assert names(sk["creatures"]) == [*DEAR, *CHEAP[:4]], names(sk["creatures"])
everything = [c for cards in sk.values() for c in cards]
assert not any("over_cap" in c for c in everything)
assert all("price_usd" in c for c in everything)
assert "budget_picks" not in sk
# The window is the first 15 listed, not the first 12 valid: five bad names up
# front leave ten.
edhrec["creatures"] = listing([*(f"Bad Name {i}" for i in range(5)), *CHEAP])
assert names(skeleton(None)["creatures"]) == CHEAP[:10]
edhrec["creatures"] = listing(LISTED)

# --- capped: flagged, not dropped, and backfilled from further down ----------- #
sk = skeleton(CAP)
got = sk["creatures"]
# Same window as before, then cheap cards past it until 12 are affordable. A
# dear card past the window (DEAR_DEEP) was never in the build, so it's skipped.
assert names(got) == [*DEAR, *CHEAP[:12]], names(got)
assert [bool(c.get("over_cap")) for c in got] == [True] * 8 + [False] * 12
for c in (c for cards in sk.values() for c in cards):
    p = price(c["name"])
    assert bool(c.get("over_cap")) == (p is None or p > CAP), (c["name"], p)
    assert c["price_usd"] == p

# A list with nothing affordable ends where it ends.
edhrec["creatures"] = listing(DEAR)
assert names(skeleton(CAP)["creatures"]) == DEAR
edhrec["creatures"] = listing(LISTED)

# Fixed staples and the suggested lands obey the cap like any other card.
tiny = skeleton(0.01)
for key in ("staples", "suggested_lands"):
    assert tiny[key] and all(c.get("over_cap") for c in tiny[key]), tiny[key]
    assert names(tiny[key]) == names(skeleton(None)[key])  # flagged, kept

# --- budget_picks: the commander's own leftovers, then the most played -------- #
picks = sk["budget_picks"]
own, generic = picks[: len(CHEAP) - 12], picks[len(CHEAP) - 12 :]
# The list's affordable cards past the 12 come first, most played first: the
# commander's own cards before anyone's generic staples.
assert names(own) == CHEAP[12:], names(own)
assert all("reason" not in c and c["num_decks"] for c in own), own
assert DEAR_DEEP not in names(picks)
assert 0 < len(generic) <= mtg._BUDGET_PICKS
assert all(c["reason"] == "most played under your price cap" for c in generic)
# (The index keeps the cheapest printing, and a few of those carry no rank.)
ranks = [r for c in generic if (r := idx.get(c["name"]).get("edhrec_rank"))]
assert len(ranks) > len(generic) / 2 and ranks == sorted(ranks), (
    ranks
)  # most played first


def check_picks(sk, cap, bracket):
    elsewhere = {
        canon(c["name"]) for k, v in sk.items() if k != "budget_picks" for c in v
    }
    seen = set()
    for c in sk["budget_picks"]:
        rec = idx.get(c["name"])
        assert not c.get("over_cap") and price(c["name"]) <= cap, c
        # Generic picks are never lands. An own leftover is whatever the
        # commander's spell lists hold, which can be a spell-front land card.
        assert "reason" not in c or not c["is_land"], c
        assert bracket >= 4 or not rec.get("game_changer"), c
        assert set(rec.get("color_identity") or []) <= {"R"}, c
        # Not already offered, under either spelling of a two-faced card.
        assert rec["name"] not in elsewhere | seen | {CMD}, c
        seen.add(rec["name"])


check_picks(sk, CAP, 2)

# Widen the generic count so the fixtures can show the two things a short list
# hides: a two-faced card already listed by its front face, and game changers
# (none below bracket 4, like fills; the bracket-5 picks must really hold one).
mtg._BUDGET_PICKS, _picks = 1000, mtg._BUDGET_PICKS
try:
    wide = skeleton(CAP)
    assert FRONT in names(wide["creatures"]) and TWO_FACED not in names(
        wide["budget_picks"]
    )
    check_picks(wide, CAP, 2)
    open_gcs = [
        n for n in names(skeleton(1000.0, bracket=5)["budget_picks"]) if is_gc(n)
    ]
    assert open_gcs, "fixture: no game changer among the uncapped-bracket picks"
    shut = skeleton(1000.0, bracket=2)
    assert not any(is_gc(n) for n in names(shut["budget_picks"]))
    # The same rule for a game changer left over in the commander's own list.
    edhrec["creatures"] = listing([*CHEAP[:14], open_gcs[0]])
    assert open_gcs[0] in names(skeleton(1000.0, bracket=5)["budget_picks"])
    assert open_gcs[0] not in names(skeleton(1000.0, bracket=2)["budget_picks"])
    edhrec["creatures"] = listing(LISTED)
finally:
    mtg._BUDGET_PICKS = _picks

# An EDHREC outage still looks like one: no top-up over an empty skeleton.
mtg.edhrec_lookup = lambda names, timeout=None:{}
assert "budget_picks" not in skeleton(CAP)
mtg.edhrec_lookup = lambda names, timeout=None:edhrec

# --- fills: the candidate pool is searched under the cap ---------------------- #
DECK = f"Commander\n1 {CMD}\nDeck\n99 Mountain\n"


def pools(cap):
    r = mtg.ai_composition_fills(DECK, bracket=2, max_card_price=cap)
    assert not r["error"] and r["fills"], r
    for f in r["fills"]:
        assert {s["name"] for s in f["suggestions"]} <= {p["name"] for p in f["pool"]}
    return {f["category"]: names(f["pool"]) for f in r["fills"]}


free = pools(None)
# The fixture must be able to show the bug: dear cards really are on offer.
assert any(price(n) > CAP for pool in free.values() for n in pool), free
capped = pools(CAP)
assert capped.keys() == free.keys()
for cat, pool in capped.items():
    assert all(price(n) is not None and price(n) <= CAP for n in pool), (cat, pool)
    assert len(pool) == len(free[cat]), (cat, pool)  # filtered before the limit

# --- endpoints ---------------------------------------------------------------- #
# TestClient's event loop needs a local socketpair on Windows; EDHREC stays stubbed.
socket.socket = _real_socket  # type: ignore[misc]
client = TestClient(main.app)
URL = "/api/deck/wizard/skeleton"
ok = client.post(URL, json={"commander": CMD, "bracket": 2, "max_card_price": CAP})
assert ok.status_code == 200, ok.text
body = ok.json()["skeleton"]
assert names(body["creatures"]) == [*DEAR, *CHEAP[:12]] and body["budget_picks"]
for none in ({}, {"max_card_price": None}):
    r = client.post(URL, json={"commander": CMD, **none})
    assert r.status_code == 200 and "budget_picks" not in r.json()["skeleton"], r.text
# The request model refuses a bad cap: 422 with a one-line reason that names
# the field and never repeats what was sent. A boolean and a numeric string
# are refused too, not read as a price.
for bad in ("abc", "5", 0, -1, 1000.01, "nan", "inf", [], {}, True, False, 10**400):
    r = client.post(URL, json={"commander": CMD, "max_card_price": bad})
    assert r.status_code == 422, (str(bad)[:20], r.status_code)
    detail = r.json()["detail"]
    assert isinstance(detail, str) and detail.startswith("Invalid max_card_price"), (
        detail
    )
    assert "abc" not in detail, detail
# A null format still means commander, and a body that isn't JSON gets a plain
# reason rather than a byte offset dressed up as a field name.
assert client.post(URL, json={"commander": CMD, "format": None}).status_code == 200
r = client.post(
    URL, content=b'{"commander": "Krenko', headers={"Content-Type": "application/json"}
)
assert r.status_code == 422 and r.json()["detail"] == "JSON decode error", r.text
# A capped build searches the bulk by format, so an unknown one is a 400 and a
# non-string a 422; neither reaches the lookup.
for fmt, want in (("bogus", 400), (["commander"], 422), (5, 422)):
    for cap in ({}, {"max_card_price": CAP}):
        r = client.post(URL, json={"commander": CMD, "format": fmt, **cap})
        assert r.status_code == want, (fmt, cap, r.status_code)
r = client.post(
    URL, json={"commander": CMD, "format": "paupercommander", "max_card_price": CAP}
)
assert r.status_code == 200 and r.json()["skeleton"]["budget_picks"], r.text

# The fills route passes the cap on. Its AI gate is not what's under test.
main._check_ai_access = lambda request: None
r = client.post(
    "/api/deck/ai/fills", json={"decklist": DECK, "bracket": 2, "max_card_price": CAP}
)
assert r.status_code == 200, r.text
sent = [p["name"] for f in r.json()["fills"] for p in f["pool"]]
assert sent and all(price(n) <= CAP for n in sent), sent
r = client.post("/api/deck/ai/fills", json={"decklist": DECK, "max_card_price": "abc"})
assert r.status_code == 422, r.status_code
# The checks the model doesn't make still answer as before.
for body, want in (
    ({"decklist": "   "}, 400),  # empty after trimming
    ({"decklist": DECK, "format": "bogus"}, 400),
    ({"decklist": DECK, "goals": {"pilot": "nobody"}}, 400),
    ({"decklist": "x" * 50_001}, 422),  # over the size limit
    ({"decklist": DECK, "bracket": 9}, 422),
    ({}, 422),  # no decklist at all
):
    r = client.post("/api/deck/ai/fills", json=body)
    assert r.status_code == want, (str(body)[:40], r.status_code)
    assert isinstance(r.json()["detail"], str), r.text[:200]

print("test_budget_cap: ok")
