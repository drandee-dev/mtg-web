"""Path resolution + mtg_utils import bootstrap for the web backend.

The web API reuses the existing ``mtg_utils`` Python library (the same code the
Claude Code skills use) rather than reimplementing card/deck/rules logic. We don't
copy that library in; we add its source directory to ``sys.path`` so imports resolve
to the single source of truth in ``mtg-deck-builder``.

Everything is overridable via environment variables so the same code runs locally
(pointing at your repo) and on a host like Render (pointing at a deployed data dir).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# This file is .../mtg-web/backend/app/config.py
_BACKEND = Path(__file__).resolve().parents[1]  # .../mtg-web/backend/
_REPO_ROOT = _BACKEND.parents[1]                # .../Claude/ (parent of mtg-web/)
_MTG = _REPO_ROOT / "mtg-deck-builder"


def _env_path(var: str, default: Path) -> Path:
    raw = os.environ.get(var)
    return Path(raw).expanduser().resolve() if raw else default


# Directory containing the `mtg_utils` package (its parent is on sys.path).
# Priority: env var > bundled copy in backend/ > sibling mtg-deck-builder repo
_BUNDLED_SRC = _BACKEND  # mtg_utils/ lives directly in backend/
_SIBLING_SRC = _MTG / ".agents" / "skills" / "deck-forge" / "src"
_DEFAULT_SRC = _BUNDLED_SRC if (_BUNDLED_SRC / "mtg_utils").is_dir() else _SIBLING_SRC

MTG_UTILS_SRC = _env_path("MTG_UTILS_SRC", _DEFAULT_SRC)

# Shared Scryfall bulk data + Comprehensive Rules text.
# On Render: set MTG_DATA_DIR to the persistent disk mount (e.g. /data).
DATA_DIR = _env_path("MTG_DATA_DIR", _MTG / "data")
BULK_PATH = _env_path("MTG_BULK_PATH", DATA_DIR / "default-cards.json")


def rules_path() -> Path:
    """Newest comprehensive-rules*.txt in DATA_DIR (matches the CLI's resolver)."""
    override = os.environ.get("MTG_RULES_PATH")
    if override:
        return Path(override).expanduser().resolve()
    candidates = sorted(DATA_DIR.glob("comprehensive-rules*.txt"))
    if not candidates:
        msg = f"No comprehensive-rules*.txt found in {DATA_DIR}"
        raise FileNotFoundError(msg)
    return candidates[-1]


def bootstrap_mtg_utils() -> None:
    """Put the mtg_utils source dir on sys.path so `import mtg_utils` resolves."""
    src = str(MTG_UTILS_SRC)
    if src not in sys.path:
        sys.path.insert(0, src)


# CORS origins allowed to call this API (the deployed frontend + local dev).
def cors_origins() -> list[str]:
    raw = os.environ.get("MTG_CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    # Sensible local-dev defaults (Vite + common alternates).
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
