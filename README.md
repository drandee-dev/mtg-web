# MTG Workshop

A browser-based Commander/EDH deck builder with an AI copilot — live at
**[mtg-workshop.vercel.app](https://mtg-workshop.vercel.app)**.

- **Frontend:** React 19 + Vite, mobile-first responsive, installable PWA → **Vercel**.
- **Backend:** FastAPI, Scryfall bulk data + Comprehensive Rules baked in at build time,
  Claude (Sonnet primary / Haiku fallback) for AI features → **Vercel Python Function**.
  Stateless — no persistent disk.
- **Accounts + deck sync (optional):** **Supabase** — email magic-link sign-in, decks synced
  across devices. Without it, the app runs fully in **local mode** (decks save to the browser;
  Export/Import moves them, and share links work either way).

Both frontend and backend are separate Vercel projects in the same account. There is no
Render/other host in the loop — Render was the original rollback target during the 2026-07
serverless cutover and was retired once Vercel proved stable.

## Features

### Deck building
- **Analyze** — paste a decklist → WUBRG color distribution, mana viability (land+ramp vs curve
  target), mana curve, type/rarity breakdown, total price ("as of" date), legality, Commander
  bracket (1–5, with game-changer callouts).
- **Guided build wizard** — pick a commander (autocomplete), then fill categories from
  AI-assisted suggestions.
- **Import** — paste text, or import a URL (Archidekt/Moxfield), with MDFC-aware grouping and
  a Considering list for cards you're weighing but haven't committed to.
- **Printing / art switcher** — pin a specific printing per card (or the whole commander), plus
  a mass-art tool to retarget a whole deck (or just the Considering pile) to a set/rarity.
- **Playtest mode** — shuffle, draw an opening hand, mulligan.
- **My Decks** — save / rename / clone / delete; auto-saves on first commander pick or when
  opened from a share link; share links carry the full decklist.

### AI copilot (Claude-powered)
- **Deck Goals** — declare target bracket, budget ceiling, protected cards/themes, pilot
  complexity, and a flavor note. Every AI feature below reads these.
- **Assessment** — bracket meter against your goal, strategy summary, gap chips for thin
  categories (draw/ramp/removal/wipes).
- **Optimize queue** — the AI proposes a changeset (cut → add, with reasoning and
  price/bracket deltas) as Apply/Skip cards; every applied change lands in a per-deck session
  log with undo.
- **Insights toolbox** — Suggest (EDHREC-style recs), Cuts, Combos/near-misses, Upgrades
  (budget or power mode), Draw odds. Results persist per deck across tab switches and reloads;
  editing the card list marks a panel "stale" (a badge + manual Refresh) rather than silently
  re-running or discarding what's shown. Individual suggestions can be **pinned** (kept
  indefinitely) or **dismissed** (hidden, reversible).
- **Planeswalker chat** — a persistent chat bot (streamed responses) for open-ended questions
  about the deck, with tappable `[[Card Name]]` chips (+ Add / ☆ Consider) and a pinned session
  log of changes it makes.
- **Rules Q&A** — plain-English rules questions, streamed, with cited rule numbers (lightweight
  RAG over the Comprehensive Rules).

### Everything else
- **Card search** over Scryfall bulk data (name/type/oracle/colors/CMC/price) with predictive
  typeahead.
- **Card image previews** — hover (desktop) or tap (mobile) any card name.
- **Mobile-first** — bottom nav, touch-friendly stack view, installable PWA with offline card
  image caching.
- **Settings** — magic-link / password sign-in (when Supabase is configured), theme switcher.

AI usage is metered per-server: a daily per-user rate limit and a monthly budget cap (see
`backend/app/usage.py`), tracked in Supabase if configured — fails open (no enforcement) if not.

---

## Run locally

**Prereqs:** Python 3.11+ and Node 18+.

### 1. Backend
```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows (Git Bash)
# macOS/Linux:  .venv/bin/pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8001  # warms data on startup (~10–20s)
```
Local dev reads Scryfall bulk + rules data from a sibling `../mtg-deck-builder/data/` directory
by default (override with `MTG_DATA_DIR`, `MTG_BULK_PATH`, `MTG_RULES_PATH`, `MTG_UTILS_SRC`).
On Vercel, `vercel_build.py` downloads and strips this data at **build time** instead — see
[Deploy](#deploy) below.

Copy `backend/.env.example` → `.env` for AI features, Supabase JWT verification / usage
tracking, and CORS overrides.

**Note:** `--reload` can leave stale worker processes running on Windows; running without
`--reload` and manually restarting is more reliable during active development.

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_BASE defaults to http://127.0.0.1:8000 — set to :8001 to match above
npm run dev              # http://localhost:5173
```
Leave the Supabase vars blank for local mode. Fill them in to enable accounts (below).

---

## Testing

```bash
cd frontend
npm run build && npm test          # E2E suite (builds, then runs Playwright against the preview server)
npm run test:headed                # same, with a visible browser
npm run test:update-snapshots       # regenerate visual regression baselines
npx eslint src/components/MyFile.jsx   # lint a changed file only

cd backend
ruff format app/ && ruff check app/    # format + lint
```

E2E specs live in `frontend/e2e/` and run against a **hermetic mock backend**
(`e2e/fixtures/mock-backend.js`) that intercepts every `/api/**` call — no live backend needed,
no network dependency. Covers navigation, deck building, imports, the AI copilot (goals,
optimize queue, assessment, chat), insights persistence, mass-art, playtest, rules, and card
search, with visual regression screenshots on key views.

---

## Enable cross-device accounts (Supabase) — your step

This needs your own logins, so it's a manual one-time setup. The app works without it.

1. Create a free project at **supabase.com** → New project.
2. **Auth:** Authentication → Providers → **Email** → enable, and turn on magic links.
   Authentication → URL Configuration → add your site URLs (e.g. `http://localhost:5173` and
   your Vercel URL) to **Redirect URLs**.
3. **Database:** SQL Editor → run this once:

   ```sql
   create table public.decks (
     id            uuid primary key default gen_random_uuid(),
     user_id       uuid not null references auth.users(id) on delete cascade,
     name          text not null,
     format        text not null default 'commander',
     decklist_text text not null default '',
     updated_at    timestamptz not null default now()
   );

   alter table public.decks enable row level security;

   create policy "own decks - select" on public.decks
     for select using (auth.uid() = user_id);
   create policy "own decks - insert" on public.decks
     for insert with check (auth.uid() = user_id);
   create policy "own decks - update" on public.decks
     for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "own decks - delete" on public.decks
     for delete using (auth.uid() = user_id);
   ```
   Row-Level Security ensures each person only ever sees their own decks.
4. **Keys:** Project Settings → API → copy the **Project URL** and the **anon public** key into
   `frontend/.env`:
   ```
   VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Restart `npm run dev`. The Settings tab now shows magic-link sign-in, and saved decks sync
   across any device you sign in on.

For AI usage tracking (daily rate limit + monthly budget cap across all your users, not just
per-browser), also set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` on
the **backend** (see `backend/.env.example`) — this is a separate step from the frontend keys
above and uses the service-role key, which must never be exposed to the client.

---

## Deploy

Both frontend and backend deploy to **Vercel** as separate projects in the same account.

### Backend → Vercel

1. **Import your repo** at [vercel.com](https://vercel.com), root `mtg-web/backend`.
2. **Framework:** none/other — Vercel auto-detects `app/main.py:app` as a Python Function via
   `pyproject.toml`'s `[tool.vercel.scripts]` build hook.
3. The build step (`vercel_build.py`) downloads + strips Scryfall bulk data and the Comprehensive
   Rules at **build time**, bundling pre-built pickle caches into the function — cold starts load
   pickles instead of parsing raw JSON (~1-2s).

**Environment variables:**

| Variable | Value |
|----------|-------|
| `MTG_CORS_ORIGINS` | `https://your-frontend.vercel.app` (no trailing slash) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (AI features; optional) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Enables AI usage tracking (budget cap + rate limit); fails open if unset |
| `SUPABASE_JWT_SECRET` | Verifies signed-in users' JWTs server-side |
| `ADMIN_EMAIL` | Lowercased email that bypasses the AI rate limit/budget cap |
| `AI_RATE_LIMIT_PER_DAY` | Per-user daily AI call cap (default 50) |
| `AI_MONTHLY_BUDGET_CENTS` | Server-wide monthly AI spend cap in cents (default 1000 = $10) |

**Keeping data fresh:** a GitHub Action (`.github/workflows/refresh-data.yml`) runs weekly and
hits a Vercel deploy hook (`VERCEL_DEPLOY_HOOK_URL` secret), which re-runs the build step and
picks up new prices/cards.

### Frontend → Vercel

1. **Import your repo** at [vercel.com](https://vercel.com), root `mtg-web/frontend`.
2. **Framework:** Vite (auto-detected).

**Environment variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_BASE` | `https://your-backend.vercel.app` |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `VITE_FORMSPREE_ID` | Formspree form ID for the feedback button (optional) |

### Pricing refresh

Card prices come from Scryfall's bulk data (`prices.usd`), updated ~once/day by Scryfall. Locally,
the backend's in-memory index is keyed on the file's mtime — replacing the file refreshes prices
without a restart (`python -m mtg_utils.download_bulk data/`). Deployed: the weekly GitHub Action
above re-triggers the Vercel build, which re-downloads bulk data.

### Costs

| Service | Cost |
|---------|------|
| Vercel (frontend + backend) | $0 (Hobby plan covers both projects) |
| Supabase (auth + DB) | $0 (free tier) |
| Domain (optional) | ~$12/yr |
| Claude API (AI features) | ~$1-10/mo, capped by `AI_MONTHLY_BUDGET_CENTS` |

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check + `data_as_of` date, AI availability/budget status |
| GET | `/api/rules/search` | Rules lookup (`?rule=`, `?term=`, or `?grep=`) |
| POST | `/api/rules/ask` | AI Rules Q&A (body: `{question}`) |
| POST | `/api/rules/ask/stream` | Same, streamed (SSE) |
| GET | `/api/cards/search` | Card search (name, oracle, type, colors, cmc, price, format) |
| GET | `/api/cards/image` | Card image URL(s) (`?name=` or `?names=a\|b\|c`) |
| GET | `/api/cards/prints` | All printings of a card |
| GET | `/api/cards/printing` | A specific printing's image/price |
| POST | `/api/cards/mass-printing` | Bulk printing lookup for the mass-art tool |
| GET | `/api/sets` | Set list (for the mass-art picker) |
| GET | `/api/commanders/search` | Commander autocomplete (`?q=`) |
| POST | `/api/deck/analyze` | Full analysis (stats, mana, legality, bracket, breakdown) |
| POST | `/api/deck/composition` | Category counts vs Commander rules-of-thumb |
| POST | `/api/deck/export` | Normalize decklist to standard import text |
| POST | `/api/deck/import-url` | Parse an Archidekt/Moxfield deck URL |
| POST | `/api/deck/recommend` | EDHREC-style recommendations (non-AI) |
| POST | `/api/deck/combos` | Combo search + near-misses (non-AI) |
| POST | `/api/deck/budget-swaps` | Cheaper-alternative suggestions (non-AI) |
| POST | `/api/deck/ai/cuts` | AI-suggested cuts with reasoning |
| POST | `/api/deck/ai/fills` | AI-suggested additions (wizard) |
| POST | `/api/deck/ai/explain` | AI explanation for why a card fits |
| POST | `/api/deck/ai/combos` | AI-narrated combo lines |
| POST | `/api/deck/ai/strategy` | Full strategy guide generation |
| POST | `/api/deck/ai/upgrades` | AI power-level upgrade suggestions |
| POST | `/api/deck/optimize` | Goal-aware changeset (cut/add) for the Optimize queue |
| POST | `/api/deck/wizard/skeleton` | Guided-build starting skeleton for a commander |
| POST | `/api/deck/wizard/narrate` | Guided-build category narration |
| POST | `/api/deck/wizard/chat` | Guided-build conversational assist |
| POST | `/api/planeswalker/chat` | Planeswalker chat bot |
| POST | `/api/planeswalker/chat/stream` | Same, streamed (SSE) |

---

## Project layout
```
mtg-web/
  backend/   FastAPI app (app/main.py, app/mtg.py, app/config.py, app/usage.py)
  frontend/  Vite React app (src/lib, src/components, src/index.css, e2e/)
  design/    Claude Design ↔ Claude Code handoff (.dc.html prototypes, HANDOFF.md, STATUS.md)
  .claude/   Project-specific Claude Code rules (.claude/rules/*.md)
  README.md  (this file)
```

See [DATA-MODEL.md](DATA-MODEL.md) for an ERD of everything the app persists
(Supabase tables, localStorage entities, and what's derived from the decklist text).

## Not in scope (by design)
- No PDFs in the web app (saving = on-account/on-device + export). Proxy printing stays a local
  Claude Code skill.
- `lgs-search` stays local (needs a real desktop browser for store checkout).
