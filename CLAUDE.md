# MTG Workshop

## Quick start

```bash
# Backend (FastAPI)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (React/Vite)
cd frontend && npm install && npm run dev
```

## Architecture

- **Frontend:** React 18 + Vite → Vercel (mtg-web-nine.vercel.app)
- **Backend:** FastAPI → Render (mtg-workshop.onrender.com)
- **Data:** Scryfall oracle_cards bulk (~8MB), Comprehensive Rules text
- **Auth:** Supabase magic-link, JWT verified server-side
- **AI:** Sonnet 4.6 primary, Haiku fallback — server-side key only
- **Storage:** Supabase `decks` table with RLS; localStorage fallback

## Key patterns

- `_ai_call()` in `backend/app/mtg.py` — shared AI wrapper with Sonnet→Haiku fallback and token tracking
- `_deck_context_cached()` — rich deck context with 30s hash-keyed cache
- `assembleDecklist()` / `disassembleDecklist()` in `frontend/src/lib/api.js` — commander header management
- Rate limit: 25 AI calls/day per IP; admin bypasses via Supabase JWT
- Monthly AI budget: $10 ceiling tracked in `backend/ai_usage.json`

## Behavioral guidelines

### Surface assumptions on ambiguous requests
When the task is unclear or has multiple interpretations — especially AI prompt changes, deck evaluation logic, or UX redesigns — state assumptions and ask before implementing. For routine bug fixes and small changes, just proceed.

### Simplicity and surgical changes
- No features beyond what was asked. No speculative abstractions.
- Touch only what the task requires. Match existing style.
- Every changed line should trace directly to the request.

### Design handoff review process
When implementing from a design handoff (`.dc.html` prototypes, spec docs):
1. **Open the prototype HTML files in a browser first** — they are visual references, not just code to read. Screenshot each screen at each breakpoint (mobile 375px, tablet 768px, desktop 1280px+) and compare against the running app
2. Cross-reference each spec item against existing code — identify what's already done vs. gaps
3. **"Exists" does not mean "matches design"** — a component existing doesn't mean its rendered output matches the prototype. Always visually compare at every breakpoint before marking anything as done
4. Scan for security issues: `dangerouslySetInnerHTML` without sanitization, unsanitized user inputs in AI prompts
5. Check for dead code from partial implementations (unused components, orphaned CSS classes)
6. Verify backend endpoints and API client wrappers exist before building frontend features
7. Prioritize: security fixes → missing features → design polish → cleanup

### CSS and data patterns (lessons learned)
- **CSS base styles go BEFORE responsive media queries** — if `.foo { display: none }` appears after `@media { .foo { display: flex } }`, the base rule wins at equal specificity. Always define base/default styles first, overrides in media queries after
- **Check data shapes before using them** — read existing components that consume the same data (e.g., `Curve.jsx` uses `Object.entries(stats.curve)` because it's an object, not an array). Never assume array vs. object
- **Test every view mode at every breakpoint** — grid, stack, and list views must all be tested on mobile, tablet, and desktop. A view mode saved in localStorage persists across sessions and breakpoints
- **Use Playwright to verify mobile rendering before pushing** — `npm run build` passing means zero about visual correctness. Render at 375×812 with `is_mobile: true` and screenshot before committing

### Verify before reporting done
For multi-step tasks, state a brief plan with verification:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```
For UI changes: start dev server, test golden path + edge cases, check for regressions.

## Security rules (always apply)

- Never hardcode secrets or admin identifiers — require env vars
- Wrap user inputs in `<user_input>` tags in AI prompts; include injection defense in system prompts
- Use Pydantic models with Field constraints for all POST bodies
- Cap regex patterns from users (200 chars) and compile in try/except
- Never leak exception details to clients — log server-side, return opaque messages
