---
paths:
  - "backend/**"
---

# Backend conventions (FastAPI + Python)

- All AI calls go through `_ai_call()` in `mtg.py` — never call Anthropic directly from endpoints
- Haiku cannot infer deck synergies from raw card lists — always pre-compute strategy profiles with `_classify_roles()` and feed them explicitly in prompts
- POST bodies use Pydantic `BaseModel` with `Field(max_length=...)` constraints — no raw dicts
- Rate limiting uses `_get_client_ip()` which parses X-Forwarded-For — always use it, not `request.client.host`
- Error responses: log full traceback server-side, return opaque message to client
- Run `uvicorn app.main:app --reload --port 8000` from `backend/`
- Format with `ruff format` before committing
