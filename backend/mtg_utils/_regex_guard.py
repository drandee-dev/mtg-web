"""Time-budgeted execution of user-supplied regexes (ReDoS guard).

Python's stdlib ``re`` uses a backtracking engine with no timeout: a crafted
pattern well under any length cap (e.g. ``(a+)+$``) can take effectively
forever against a modest haystack. The third-party ``regex`` module accepts a
``timeout=`` on match operations, which is the only clean kill-switch.

``TimeboxedPattern`` wraps a compiled ``regex`` pattern behind the same
``.search(text)`` shape callers already use for ``re.Pattern``, spending one
shared wall-clock budget across *all* searches made through it — so a loop
over thousands of rules/cards is bounded as a whole, not per item. Benign
patterns finish in microseconds and never notice the budget.
"""

from __future__ import annotations

import time
from typing import Any

import regex as _regex


class RegexBudgetError(TimeoutError):
    """The user's pattern exhausted its total matching time budget."""


class TimeboxedPattern:
    """A ``re.Pattern``-alike with a total wall-clock budget across searches.

    Raises ``ValueError`` on a bad pattern (mirroring how callers already
    translate ``re.error``) and ``RegexBudgetError`` once the budget is spent.
    The budget clock starts at the first ``search()`` call, not at compile.
    """

    def __init__(self, pattern: str, flags: int = 0, budget_s: float = 2.0) -> None:
        try:
            self._pattern = _regex.compile(pattern, flags)
        except _regex.error as exc:
            msg = f"Invalid regex: {exc}"
            raise ValueError(msg) from exc
        self._budget = budget_s
        self._deadline: float | None = None

    def search(self, text: str) -> Any:
        now = time.monotonic()
        if self._deadline is None:
            self._deadline = now + self._budget
        remaining = self._deadline - now
        if remaining <= 0:
            msg = "Pattern too slow to evaluate."
            raise RegexBudgetError(msg)
        try:
            return self._pattern.search(text, timeout=remaining)
        except TimeoutError as exc:
            msg = "Pattern too slow to evaluate."
            raise RegexBudgetError(msg) from exc
