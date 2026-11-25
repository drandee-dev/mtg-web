"""Live check that EDHREC still sends the card lists we parse. Run: python check_edhrec_live.py

Not hermetic on purpose: every other test stubs the page, so when EDHREC renamed
"highsynergycards" (2026-11) the suggestions went empty and nothing failed. Run weekly
by .github/workflows/refresh-data.yml. Exit 1 names what changed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import requests  # noqa: E402

from mtg_utils import edhrec_lookup as el  # noqa: E402

# Long-lived commanders whose page had a high-lift list on 2026-11-25. Not every page
# has one (Atraxa's has none), so an empty list here is EDHREC changing, not data.
COMMANDERS = ["Edgar Markov", "Sliver Gravemother"]


def problems_for(name: str) -> list[str]:
    url = el.EDHREC_JSON_URL.format(slug=el.slugify(name))
    page = requests.get(url, headers={"User-Agent": el.USER_AGENT}, timeout=30).json()
    lists = page.get("container", {}).get("json_dict", {}).get("cardlists", [])
    out = [
        f"{name}: unknown list tag {c.get('tag')!r} ({c.get('header')!r})"
        for c in lists
        if c.get("tag") not in el.CARDLIST_TAGS
    ]
    parsed = el.edhrec_lookup([name], timeout=30)
    top = parsed["high_synergy"]
    if not top:
        out.append(
            f"{name}: high_synergy is empty (tags seen: {[c.get('tag') for c in lists]})"
        )
    elif not any(cv["lift"] for cv in top):
        out.append(f"{name}: no lift on the high_synergy cards")
    if not parsed["top_cards"]:
        out.append(f"{name}: top_cards is empty")
    return out


if __name__ == "__main__":
    found = [p for n in COMMANDERS for p in problems_for(n)]
    for p in found:
        print("FAIL:", p)
    if found:
        sys.exit(1)
    print(f"ok: EDHREC lists parse for {len(COMMANDERS)} commanders")
