# Current State — Visual Sitemap

> Last updated: 2026-06-28
> Screenshots in `design/reference/` (gitignored — local only, regenerate with Playwright)

## Pages / Views

| View | Mobile | Desktop | Description |
|------|--------|---------|-------------|
| Landing (new user) | `landing-new-user-mobile.png` | `landing-new-user-desktop.png` | Hero art, AI chat preview, 3 CTAs (New Deck, Import URL, Paste List, Guided), inline URL import bar |
| My Decks (returning) | `my-decks-mobile.png` | `my-decks-desktop.png` | Deck hero grid with art/format/count/time, filter toolbar (search, format, sort), inline URL import, + New Deck |
| Deck Builder (empty) | `deck-builder-mobile.png` | `deck-builder-desktop.png` | Format selector, commander input, wizard toggle, empty card grid with type filters |
| Deck Builder (loaded) | `deck-open-mobile.png` | `deck-open-desktop.png` | Commander column with card art + bracket estimate, card grid, sidebar with AI analysis |
| Stack View (image) | `stack-image-role-mobile.png` | `stack-image-role-desktop.png` | 180px overlapping card columns grouped by role, push-down hover, price totals, drag handle (desktop) / ⋯ menu (mobile) |
| Stack View (text) | `stack-text-role-mobile.png` | `stack-text-role-desktop.png` | Archidekt-faithful text rows: qty + name + mana pips, per-column price totals, Image/Text sub-toggle |
| Rules Q&A | `rules-mobile.png` | `rules-desktop.png` | Chat-style rules question input with AI-powered answers |
| Card Search | `card-search-mobile.png` | `card-search-desktop.png` | Search by name, type, oracle text (regex), color identity, max CMC |

## Navigation

- **Desktop:** Top toolbar tabs (My Decks, Analyze & Build, Rules, Card Search) + avatar dropdown menu
- **Mobile (<700px):** Bottom nav bar (Decks, Build, Rules, Cards) — top toolbar tabs are hidden
- **Tab state:** SPA with `?tab=` query param sync, no react-router. Aliases: `?tab=analyze` → deck, `?tab=build` → deck

## Overlays / Modals

| Component | Trigger | Notes |
|-----------|---------|-------|
| Cold-start overlay | Backend waking from sleep | Blocks interaction until /api/health returns 200 |
| Avatar popup | Click avatar (top-right) | Actions + navigation + recent decks + account |
| Account settings | Avatar → Account Settings | Sign in/out, API key, theme toggle |
| Playtest mode | Deck view → Playtest button | Full-screen card-draw simulation |
| Planeswalker chat | Floating button (bottom-right) | AI chat assistant, always available |
| Feedback widget | "?" button (bottom-right, behind Planeswalker) | Formspree form |

## How to regenerate screenshots

From the project root, build pointing at the live backend and run:
```bash
cd frontend && VITE_API_BASE=https://mtg-workshop.onrender.com npm run build
npx vite preview --port 4173
# Then run the Playwright screenshot script (mocks backend for speed)
```
