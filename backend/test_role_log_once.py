"""Self-check: a failing role preset is logged once per preset, not once per card.
Run: python test_role_log_once.py

_classify_roles runs per card and per role check, so a preset that fails for every
card used to be silent and, once it logged (audit job 5.8), could flood the log with
a stack trace per card. No network, no cost.
"""

import logging
import sys

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from app import mtg

logged: list[logging.LogRecord] = []


class _Capture(logging.Handler):
    def emit(self, record):
        logged.append(record)


log = logging.getLogger("mtg-web")
log.addHandler(_Capture())
log.propagate = False


def broken(_name):
    raise RuntimeError("preset broke")


real = mtg.get_preset
mtg.get_preset = broken
idx = mtg._bulk_index()
# The response still comes back for every card.
for name in ("Sol Ring", "Lightning Bolt", "Counterspell"):
    assert mtg._classify_roles(idx.get(name)) is not None
mtg.get_preset = real

role_logs = [r for r in logged if r.getMessage().startswith("roles: preset")]
presets = {key for key, _ in mtg._ROLE_CHECKS}
assert len(role_logs) == len(presets), (len(role_logs), len(presets))
print(f"ok: {len(role_logs)} role log lines for 3 cards, one per preset")
