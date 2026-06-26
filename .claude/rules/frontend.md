---
paths:
  - "frontend/**"
---

# Frontend conventions (React + Vite)

- Dark theme: shadcn/ui-inspired, `#0c0d11` background, Inter font, semi-transparent borders
- Layout: GlobalToolbar (desktop top bar) + BottomNav (mobile <700px) — never add a hamburger
- Card images use percentage-radius corners via CardThumbnail — never hardcode border-radius on card art
- State lives in App.jsx and flows down — no global state library
- API calls go through `frontend/src/lib/api.js` — never call fetch/axios directly
- Supabase client in `lib/supabase.js`, storage abstraction in `lib/store.js`
- Deck parsing and grouping logic in `lib/deckParser.js` — groupCards handles type/role/cmc/color/rarity/price
- Run `npm run dev` from `frontend/`; Vite proxies nothing — all API calls go to VITE_API_BASE
- PWA: service worker via vite-plugin-pwa, update banner above BottomNav on mobile
