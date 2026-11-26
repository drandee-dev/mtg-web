"""Self-check: the rules the app loads include the bundled digital supplement.
Run: python test_digital_rules.py

mtg_utils/data/digital-rules.txt holds the MTG Arena "designed for digital"
rules (DD1.x, perpetually and friends) that are not in the Comprehensive Rules.
rules_lookup merges it silently and skips it silently when the file is missing,
so job 5.3's first pass deleted it with nothing failing. Real rules file; no
network, no cost.
"""

import sys

sys.path.insert(0, ".")
from app import config

config.bootstrap_mtg_utils()

from mtg_utils.rules_lookup import _DIGITAL_RULES_FILE, load_rules

assert _DIGITAL_RULES_FILE.is_file(), f"missing {_DIGITAL_RULES_FILE}"
parsed = load_rules(config.rules_path())
assert "DD1.2" in parsed["rules"], sorted(k for k in parsed["rules"] if k.startswith("DD"))
print("ok: the digital rules supplement is loaded")
