# MTG Workshop — web app

A browser version of your MTG deck tools, for you and friends. Phase 1 (built) ships the
free, deterministic features; Phase 2 (later) adds optional AI.

- **Frontend:** React (Vite), mobile-first responsive → deploys to **Vercel** (free).
- **Backend:** FastAPI, reuses your existing `mtg_utils` library + Scryfall/rules data →
  deploys to **Render** (~$5–7/mo). Stateless (no user data).
- **Accounts + deck sync (optional):** **Supabase** (free) — email magic-link sign-in, decks
  synced across devices. Without it, the app still works fully in **local mode** (decks save to
  the browser; Export/Import moves them).

## Features

### Phase 1 (working — free, deterministic)
- **Analyze** — paste a decklist → WUBRG color distribution, mana viability (land+ramp vs curve
  target), mana curve, type/rarity breakdown, total price (with "as of" date), legality, Commander
  bracket. Separate commander input with autocomplete.
- **Build — guided deck builder**: pick your commander (autocomplete, "nethroi" → *Nethroi, Apex of
  Death*), then add cards from **EDHREC recommendations** (synergy % + play rate, **+ Add**) and
  **combos / near-misses** ("add this one card to complete a combo"). **Composition** panel counts
  removal / draw / ramp / wipes / lands vs Commander rules-of-thumb, flags thin categories. Sections
  the AI phase will power show an **✨ AI** tooltip.
- **Rules** — Comprehensive Rules lookup by rule number, glossary term, or text search.
- **AI Rules Q&A** — ask plain-English questions ("Can I counter a triggered ability?"), get a
  natural-language answer with cited rule numbers. Uses lightweight RAG (grep retrieval + Claude).
  Requires an API key (owner's or visitor's); hidden when no key is available.
- **Card search** over Scryfall bulk data (name/type/oracle/colors/CMC/price).
- **Card image previews** — hover (desktop) or tap (mobile) any card name to see the full card.
- **My Decks** — save / rename / delete; import Archidekt/Moxfield/Arena/CSV/plain text; export
  canonical `N CardName` text or `.json` backup.
- **Settings** — magic-link sign-in (when Supabase is set) + optional personal Anthropic API key.

### Phase 2 (planned)
- Conversational AI deck builder ("explain why this card fits / critique my list")
- AI-suggested cuts with reasoning
- Full strategy guide generation

See [[projects/mtg-web/DESIGN-HANDOFF|Phase 2 design handoff]] for the full UX spec, and the [[projects/mtg-web/design_handoff_mtg_workshop/|frontend redesign handoff]] for implementation details. The web app builds on the CLI tools from [[projects/mtg-deck-builder/|MTG Deck Builder]].

---

## Run locally

**Prereqs:** Python 3.12+ and Node 18+.

### 1. Backend
```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows (Git Bash)
# macOS/Linux:  .venv/bin/pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000  # warms data on startup (~10–20s)
```
The backend finds your Scryfall bulk + rules in `../mtg-deck-builder/data/` by default. Override
with env vars if needed: `MTG_DATA_DIR`, `MTG_BULK_PATH`, `MTG_RULES_PATH`, `MTG_UTILS_SRC`,
`MTG_CORS_ORIGINS`.

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_BASE defaults to http://127.0.0.1:8000
npm run dev              # http://localhost:5173
```
Leave the Supabase vars blank for local mode. Fill them in to enable accounts (below).

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

---

## Deploy

### Backend → Render

1. **Create a Web Service** at [render.com](https://render.com) from your GitHub repo.
2. **Root directory:** `mtg-web/backend`
3. **Runtime:** Python 3
4. **Build command:** `pip install -r requirements.txt`
5. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Plan:** Starter ($7/mo) — avoids cold-start sleep on the free tier.
7. **Persistent disk:** attach ~1 GB mounted at `/data` for the Scryfall bulk file + rules.

**Environment variables:**

| Variable | Value |
|----------|-------|
| `MTG_UTILS_SRC` | Path to `mtg_utils` source on the host |
| `MTG_DATA_DIR` | `/data` (persistent disk mount) |
| `MTG_CORS_ORIGINS` | `https://your-app.vercel.app` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (AI features; optional) |

**Getting bulk data onto Render:** upload `default-cards.json` + sidecar to the persistent disk,
or add a build/cron step: `python -m mtg_utils.download_bulk /data`. For fresh prices, set up a
daily cron job (`0 6 * * *`) to re-download — the backend auto-reloads when the file changes.

### Frontend → Vercel

1. **Import your repo** at [vercel.com](https://vercel.com), root `mtg-web/frontend`.
2. **Framework:** Vite (auto-detected).

**Environment variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_BASE` | `https://your-backend.onrender.com` |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

### Pricing refresh

Card prices come from Scryfall's bulk data (`prices.usd`), updated ~once/day by Scryfall. The
backend's in-memory index is keyed on the file's mtime — replacing the file refreshes prices
without a restart. Locally: `python -m mtg_utils.download_bulk data/`. Deployed: Render daily cron.

### Costs

| Service | Cost |
|---------|------|
| Vercel (frontend) | $0 (Hobby) |
| Supabase (auth + DB) | $0 (free tier) |
| Render (backend) | ~$7/mo (Starter) |
| Domain (optional) | ~$12/yr |
| Claude API (AI Q&A) | ~$1-5/mo for a friends group |

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check + `data_as_of` date |
| GET | `/api/rules/search` | Rules lookup (`?rule=`, `?term=`, or `?grep=`) |
| POST | `/api/rules/ask` | AI Rules Q&A (body: `{question, api_key?}`) |
| GET | `/api/cards/search` | Card search (name, oracle, type, colors, cmc, price, format) |
| GET | `/api/cards/image` | Card image URL(s) (`?name=` or `?names=a|b|c`) |
| GET | `/api/commanders/search` | Commander autocomplete (`?q=`) |
| POST | `/api/deck/analyze` | Full analysis (stats, mana, legality, bracket, breakdown) |
| POST | `/api/deck/export` | Normalize decklist to standard import text |
| POST | `/api/deck/recommend` | EDHREC recommendations for a commander deck |
| POST | `/api/deck/combos` | Combo search + near-misses |
| POST | `/api/deck/composition` | Category counts vs Commander rules-of-thumb |

---

## Project layout
```
mtg-web/
  backend/   FastAPI app (app/config.py, app/mtg.py, app/main.py) + requirements.txt
  frontend/  Vite React app (src/lib, src/components, index.css)
  README.md  (this file)
```

## Not in scope (by design)
- No PDFs in the web app (saving = on-account/on-device + export). Proxy printing stays a local
  Claude Code skill.
- `lgs-search` stays local (needs a real desktop browser for store checkout).
