"""EDHREC commander recommendation lookup."""

import json
import re

import click
import requests

from mtg_utils.names import normalize_card_name

EDHREC_JSON_URL = "https://json.edhrec.com/pages/commanders/{slug}.json"
EDHREC_PAGE_URL = "https://json.edhrec.com/pages{path}.json"
USER_AGENT = "commander-utils/0.1.0"

CARDLIST_TAGS = {
    "highsynergycards": "high_synergy",
    "topcards": "top_cards",
    "newcards": "new_cards",
    "creatures": "creatures",
    "instants": "instants",
    "sorceries": "sorceries",
    "utilityartifacts": "artifacts",
    "enchantments": "enchantments",
    "planeswalkers": "planeswalkers",
    "utilitylands": "utility_lands",
    "lands": "lands",
}


def slugify(*names: str) -> str:
    parts: list[str] = []
    for name in names:
        # EDHREC pages a DFC/meld card under its FRONT face only, and an Arena-
        # rebalanced "A-" card under the original (non-rebalanced) name. Slugging the
        # whole "Front // Back" string or keeping the "A-" prefix 403s/404s.
        base = name.split("//")[0].strip().removeprefix("A-")
        # Hyphens in card names (e.g., "Fae-Cursed") must become word separators
        # in the slug, so convert to spaces before stripping non-alphanumeric chars.
        hyphen_to_space = base.replace("-", " ")
        # ASCII-fold accented letters to their base (Márton -> marton, Nazgûl ->
        # nazgul), matching EDHREC's slugs. Deleting them outright (the old
        # re.sub([^a-zA-Z0-9 ])) gave "mrton-stromgald" and a 403. normalize_card_name
        # NFKD-decomposes, drops combining marks, and lowercases.
        folded = normalize_card_name(hyphen_to_space)
        cleaned = re.sub(r"[^a-z0-9 ]", "", folded)
        slug = re.sub(r"\s+", "-", cleaned.strip())
        parts.append(slug)
    return "-".join(parts)


def _extract_cardviews(cardviews: list[dict]) -> list[dict]:
    return [
        {
            "name": cv.get("name", ""),
            "synergy": cv.get("synergy", 0.0),
            "inclusion": cv.get("inclusion", 0),
            "num_decks": cv.get("num_decks", 0),
            "potential_decks": cv.get("potential_decks", 0),
        }
        for cv in cardviews
    ]


def _get_json(session: requests.Session, url: str) -> dict | None:
    """The page's JSON, or None for a 404 (no page). Other errors raise."""
    resp = session.get(url)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def edhrec_lookup(commanders: list[str]) -> dict:
    slug = slugify(*commanders)
    url = EDHREC_JSON_URL.format(slug=slug)

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    data = _get_json(session, url)

    # A pairing has one canonical page, and its order is EDHREC's choice: not
    # alphabetical (Backgrounds and Doctors come commander-first), so never sort
    # here. The other order answers 200 with only {"redirect": "/commanders/<canonical>"} and
    # no cardlists, which parsed as all-empty. Follow it exactly once; a redirect
    # back to this page, or a second redirect, just parses as empty.
    redirect = data.get("redirect") if data else None
    if (
        isinstance(redirect, str)
        and redirect.startswith("/commanders/")
        and "container" not in data
    ):
        target = EDHREC_PAGE_URL.format(path=redirect)
        if target != url:
            data = _get_json(session, target)

    result: dict[str, list[dict]] = {v: [] for v in CARDLIST_TAGS.values()}
    if not data:
        return result

    cardlists = data.get("container", {}).get("json_dict", {}).get("cardlists", [])
    for cardlist in cardlists:
        tag = cardlist.get("tag", "")
        if tag in CARDLIST_TAGS:
            key = CARDLIST_TAGS[tag]
            result[key] = _extract_cardviews(cardlist.get("cardviews", []))

    return result


@click.command()
@click.argument("commanders", nargs=-1, required=True)
def main(commanders: tuple[str, ...]) -> None:
    """Fetch EDHREC recommendations for a commander."""
    result = edhrec_lookup(list(commanders))
    click.echo(json.dumps(result, indent=2))
