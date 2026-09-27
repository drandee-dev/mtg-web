"""Self-check for EDHREC partner-page redirects. Run: python test_edhrec_redirect.py

Hermetic: stubs the HTTP get, so it needs no network. EDHREC keeps one canonical
page per partner pair (alphabetical); the other order answers 200 with only
{"redirect": ...} and no cardlists, which used to parse as all-empty.
"""
import sys

sys.path.insert(0, ".")
from app import config  # noqa: E402

config.bootstrap_mtg_utils()

import requests  # noqa: E402

from app import mtg  # noqa: E402
from mtg_utils import edhrec_lookup as el  # noqa: E402

CANONICAL = "/commanders/thrasios-triton-hero-tymna-the-weaver"
PAGE = {
    "container": {
        "json_dict": {
            "cardlists": [
                {
                    "tag": "highsynergycards",
                    "cardviews": [
                        {"name": "Kraum, Ludevic's Opus", "synergy": 0.3,
                         "num_decks": 10, "potential_decks": 20},
                    ],
                }
            ]
        }
    }
}


class FakeResp:
    def __init__(self, payload, status=200):
        self.payload, self.status_code = payload, status

    def json(self):
        return self.payload

    def raise_for_status(self):
        pass


def stub_get(*payloads):
    """Answer successive GETs with *payloads*; record the URLs asked for."""
    urls = []
    queue = list(payloads)

    def get(self, url, **kw):
        urls.append(url)
        assert queue, f"unexpected extra GET {url}"
        return FakeResp(queue.pop(0))

    requests.Session.get = get
    return urls


def test_follows_redirect_once():
    urls = stub_get({"redirect": CANONICAL}, PAGE)
    out = el.edhrec_lookup(["Tymna the Weaver", "Thrasios, Triton Hero"])
    assert out["high_synergy"], out
    assert urls == [
        "https://json.edhrec.com/pages/commanders/tymna-the-weaver-thrasios-triton-hero.json",
        f"https://json.edhrec.com/pages{CANONICAL}.json",
    ], urls
    print("ok: partner redirect is followed to the canonical page")


def test_self_redirect_does_not_loop():
    urls = stub_get({"redirect": CANONICAL})
    out = el.edhrec_lookup(["Thrasios, Triton Hero", "Tymna the Weaver"])
    assert len(urls) == 1, urls
    assert not any(out.values()), out
    print("ok: a redirect to the same page is not followed")


def test_second_redirect_not_followed():
    urls = stub_get({"redirect": CANONICAL}, {"redirect": "/commanders/elsewhere"})
    out = el.edhrec_lookup(["Tymna the Weaver", "Thrasios, Triton Hero"])
    assert len(urls) == 2, urls
    assert not any(out.values()), out
    print("ok: a second redirect is not followed")


def test_all_empty_gives_note():
    mtg.edhrec_lookup = lambda names: {v: [] for v in el.CARDLIST_TAGS.values()}
    mtg._bulk_index = lambda: {}  # no Scryfall download needed
    r = mtg.deck_recommendations("Commander\n1 Tymna the Weaver\n1 Thrasios, Triton Hero")
    want = "EDHREC has no recommendations for this commander pairing."
    assert r.get("note") == want, r
    print("ok: all-empty recommendations carry a note")


if __name__ == "__main__":
    _real_get, _real_lookup, _real_index = (
        requests.Session.get, mtg.edhrec_lookup, mtg._bulk_index
    )
    try:
        test_follows_redirect_once()
        test_self_redirect_does_not_loop()
        test_second_redirect_not_followed()
        test_all_empty_gives_note()
        print("\nall passed")
    finally:
        requests.Session.get, mtg.edhrec_lookup, mtg._bulk_index = (
            _real_get, _real_lookup, _real_index
        )
