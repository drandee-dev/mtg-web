"""One-time Haiku 4.5 classification batch: for every commander-eligible card,
ask for {playstyle, difficulty, wins_via: [], themes: []} and save the result
to backend/data/commander_chips.json.

This is a REAL-MONEY batch job (~$2-4 estimated for ~3,300 commanders via the
Batches API, at 50% of standard Haiku 4.5 pricing). It is approved, but the
dry-run gate below is not optional:

    python scripts/build_commander_chips.py --selftest      # no API calls, no key needed
    python scripts/build_commander_chips.py --dry-run 15     # real API call, ~15 commanders
    # eyeball the output + the printed cost projection, THEN:
    python scripts/build_commander_chips.py                  # full run, all ~3,300

Run from backend/ (needs ANTHROPIC_API_KEY — same source as the rest of the app,
see app/config.py / app/mtg.py). Resumable: commanders already present in the
output file are skipped, so a dry run's results feed the full run rather than
being thrown away, and a full run can be safely re-invoked after a failure.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

from app import config  # noqa: E402

config.bootstrap_mtg_utils()

from mtg_utils.commander_directory import (  # noqa: E402
    build_commander_directory,
    load_chips,
    slugify,
)

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 300

SYSTEM_PROMPT = (
    "You are classifying Magic: The Gathering commanders for a deck-building app. "
    "Given a commander's name, color identity, and oracle text, respond with ONLY "
    "a JSON object (no prose, no markdown fences) shaped exactly like:\n"
    '{"playstyle": "<3-6 word phrase>", "difficulty": "<one of: Beginner, Moderate, Advanced>", '
    '"wins_via": ["<short phrase>", ...], "themes": ["<short phrase>", ...]}\n'
    "wins_via and themes should each have 1-4 entries. Be specific to this card, not generic."
)


def _user_prompt(entry: dict[str, Any]) -> str:
    ci = "".join(entry.get("color_identity") or []) or "Colorless"
    oracle = (entry.get("oracle_text") or "").strip()[:600]
    return f"Name: {entry['name']}\nColor identity: {ci}\nOracle text: {oracle}"


def _parse_chip_response(text: str) -> dict[str, Any] | None:
    """Parse + validate one classification response. Returns None (caller skips
    that commander) for anything malformed — empty text, non-JSON, wrong shape,
    or a missing/wrong-typed field. Never raises."""
    if not text or not text.strip():
        return None
    stripped = text.strip()
    # Tolerate a stray ```json fence even though the prompt asks against it.
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        stripped = stripped[4:] if stripped.lower().startswith("json") else stripped
    try:
        data = json.loads(stripped)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    playstyle = data.get("playstyle")
    difficulty = data.get("difficulty")
    wins_via = data.get("wins_via")
    themes = data.get("themes")
    if not isinstance(playstyle, str) or not playstyle.strip():
        return None
    if not isinstance(difficulty, str) or not difficulty.strip():
        return None
    if not isinstance(wins_via, list) or not all(isinstance(x, str) for x in wins_via):
        return None
    if not isinstance(themes, list) or not all(isinstance(x, str) for x in themes):
        return None
    return {
        "playstyle": playstyle.strip(),
        "difficulty": difficulty.strip(),
        "wins_via": wins_via,
        "themes": themes,
    }


# Batch pricing = 50% of standard per-token rates.
_BATCH_IN_PER_MTOK = 1.00 / 2
_BATCH_OUT_PER_MTOK = 5.00 / 2


def run_batch(
    entries: list[dict[str, Any]], client: Any
) -> tuple[dict[str, dict], float, int]:
    """Submit one batch for `entries`, poll to completion, parse results.
    Returns (chips_by_name, actual_cost_usd, skipped_count)."""
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    by_slug = {slugify(e["name"]): e["name"] for e in entries}
    requests = [
        Request(
            custom_id=slugify(e["name"]),
            params=MessageCreateParamsNonStreaming(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": _user_prompt(e)}],
            ),
        )
        for e in entries
    ]

    batch = client.messages.batches.create(requests=requests)
    print(f"Submitted batch {batch.id} ({len(requests)} requests). Polling...")
    while True:
        batch = client.messages.batches.retrieve(batch.id)
        if batch.processing_status == "ended":
            break
        rc = batch.request_counts
        print(
            f"  status={batch.processing_status} processing={rc.processing} "
            f"succeeded={rc.succeeded} errored={rc.errored}"
        )
        time.sleep(20)

    chips: dict[str, dict] = {}
    cost = 0.0
    skipped = 0
    for result in client.messages.batches.results(batch.id):
        name = by_slug.get(result.custom_id)
        if name is None:
            skipped += 1
            continue
        if result.result.type != "succeeded":
            print(f"  [skip] {name}: batch result type = {result.result.type}")
            skipped += 1
            continue
        msg = result.result.message
        text = next((b.text for b in msg.content if b.type == "text"), "")
        parsed = _parse_chip_response(text)
        if parsed is None:
            print(f"  [skip] {name}: malformed/empty response: {text[:120]!r}")
            skipped += 1
            continue
        chips[name] = parsed
        usage = msg.usage
        cost += (usage.input_tokens / 1_000_000) * _BATCH_IN_PER_MTOK
        cost += (usage.output_tokens / 1_000_000) * _BATCH_OUT_PER_MTOK

    return chips, cost, skipped


def _selftest() -> None:
    """No API calls, no key needed — proves the parse/skip logic before any
    money is spent. Run: python scripts/build_commander_chips.py --selftest"""
    good = _parse_chip_response(
        json.dumps(
            {
                "playstyle": "Superfriends control",
                "difficulty": "Advanced",
                "wins_via": ["Combat damage", "Ultimates"],
                "themes": ["Proliferate", "Counters"],
            }
        )
    )
    assert good and good["playstyle"] == "Superfriends control", good

    fenced = _parse_chip_response(
        '```json\n{"playstyle": "Aggro", "difficulty": "Beginner", "wins_via": ["Combat"], "themes": ["Go wide"]}\n```'
    )
    assert fenced and fenced["difficulty"] == "Beginner", fenced

    assert _parse_chip_response("") is None, "empty response must skip, not crash"
    assert _parse_chip_response("not json at all") is None, "non-JSON must skip"
    assert _parse_chip_response('{"playstyle": "X"}') is None, (
        "missing fields must skip"
    )
    assert (
        _parse_chip_response(
            '{"playstyle": "X", "difficulty": "Y", "wins_via": "not a list", "themes": []}'
        )
        is None
    ), "wrong-typed field must skip"

    print("build_commander_chips._selftest: OK")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dry-run",
        type=int,
        metavar="N",
        help="classify only the top-N commanders by EDHREC rank (real API call)",
    )
    ap.add_argument(
        "--out", type=Path, default=config.DATA_DIR / "commander_chips.json"
    )
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="run the offline parse/skip self-check and exit (no API calls)",
    )
    args = ap.parse_args()

    if args.selftest:
        _selftest()
        return

    import anthropic

    client = (
        anthropic.Anthropic()
    )  # resolves ANTHROPIC_API_KEY / ant auth same as the rest of the app

    directory = build_commander_directory(config.BULK_PATH, chips=None)
    existing = load_chips(args.out)
    todo = [e for e in directory if e["name"] not in existing]
    if args.dry_run:
        todo = todo[: args.dry_run]

    if not todo:
        print("Nothing to classify — every commander already has chips in", args.out)
        return

    label = (
        f"DRY RUN ({len(todo)} of {len(directory)} commanders)"
        if args.dry_run
        else f"FULL RUN ({len(todo)} of {len(directory)} commanders, {len(existing)} already done)"
    )
    print(label)

    chips, cost, skipped = run_batch(todo, client)
    existing.update(chips)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(existing, indent=None), encoding="utf-8")

    per_item = cost / len(todo) if todo else 0.0
    projected_full = per_item * len(directory)
    print(
        f"\nClassified {len(chips)}/{len(todo)} ({skipped} skipped as malformed/empty)."
    )
    print(
        f"Actual batch cost this run: ${cost:.4f}  (${per_item * 1000:.3f} / 1000 commanders)"
    )
    print(
        f"Projected cost for all {len(directory)} commanders at this rate: ${projected_full:.2f}"
    )
    print(f"Wrote {len(existing)} total commanders with chips to {args.out}")

    if args.dry_run:
        if projected_full > 8.0:  # 2x the top of the ~$2-4 estimate
            print(
                "\nSTOP: projected full-batch cost exceeds 2x the ~$2-4 estimate. "
                "Do not run the full batch — report back first."
            )
        else:
            print(
                "\nDry run within the approved estimate. Re-run without --dry-run "
                "to classify the rest (already-done commanders are skipped)."
            )


if __name__ == "__main__":
    main()
