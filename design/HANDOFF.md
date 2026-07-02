# MTG Workshop — Master Design Handoff

> **Claude Code: Start here.** This file tells you which design docs are current, which are superseded, and what to implement in what order.

---

## Quick reference — which doc covers what

| Feature | Doc to read | DC file to open |
|---|---|---|
| New deck flow redesign (2026-07-01) — **IMPLEMENTED**, see `STATUS.md` | `design/new-deck-flow/README.md` | `design/new-deck-flow/new-deck-flow.dc.html` |
| Landing page bug fixes (2026-06-29) | `design/Landing page bug fixes/design_handoff_landing_fixes/README.md` | Patched `MyDecks.jsx` included |
| Landing page (new + returning user) | `design/README.md` → Screens A–D | `MTG Workshop Phase 2.dc.html` |
| Card thumbnail hover actions | `design/README.md` → Frame E | `MTG Workshop Phase 2.dc.html` |
| Avatar dropdown popup | `design/README.md` → Frame F | `MTG Workshop Phase 2.dc.html` |
| Deck editor toolbar redesign | `design/README.md` → Frame G | `MTG Workshop Phase 2.dc.html` |
| Account modal (signed in/out) | `design/README.md` → Frame H | `MTG Workshop Phase 2.dc.html` |
| Deck builder 3-col layout + stack view | `design/README.md` → Screen 3 | `MTG Workshop Deck Builder.dc.html` |
| Rules Q&A chat interface | `design/README.md` → Screen 4 | `MTG Workshop Landing Redesign.dc.html` |
| Mobile screens + bottom sheet | `design/README.md` → Screen 5 | `MTG Workshop Mobile Preview.dc.html` |
| AI panel sections + API spec | `design/README.md` → Screen 3 | `MTG Workshop AI Panel - API Spec.dc.html` |

---

## Superseded / ignore these

| File | Why |
|---|---|
| `DESIGN-HANDOFF.md` (root) | Original design brief — describes what to build, not how. Superseded by the handoff READMEs below. Archive or delete. |
| `MTG Workshop Design Updates.zip` | Old DC files. Superseded by the `.dc.html` files listed above. Delete. |
| `design-ref/*.png` | Outdated screenshots. Phase 2 screens not captured here. Delete or replace. |

---

## Implementation priority order

Work through these in order — each builds on the previous:

### Priority 1 — Landing & navigation (Phase 2 · immediate impact)
1. **Avatar dropdown popup** (`GlobalToolbar.jsx`) — Frame F in Phase 2.dc.html
2. **Landing · new user** (`MyDecks.jsx` empty state) — Frames A + B
3. **My Decks filter toolbar** (`MyDecks.jsx`) — Frames C + D
4. **Inline URL import** (toolbar + `POST /api/deck/import-url`) — Frames B + D
5. **Deck editor toolbar redesign** (`DeckToolbar.jsx` or `CardGrid.jsx`) — Frame G

### Priority 2 — Card interactions (Phase 2)
6. **Card thumbnail hover overlay** (`CardThumbnail.jsx`) — Frame E desktop
7. **Card thumbnail mobile sheet** (`CardThumbnail.jsx`) — Frame E mobile
8. **Account modal signed-in/out states** (`AccountDropdown.jsx`) — Frame H

### Priority 3 — Deck builder overhaul (Phase 1 · larger scope)
9. **Deck builder 3-col layout** (`DeckView.jsx`) — `MTG Workshop Deck Builder.dc.html`
10. **Stack view component** (new `StackView.jsx`)
11. **AI panel accordion sections** (`DeckSidebar.jsx`)
12. **Rules Q&A chat interface** (`Rules.jsx`)
13. **Mobile deck view + AI bottom sheet**

---

## Design token reference (single source of truth)

```css
/* Already in frontend/src/index.css — do not hardcode these values */
--bg: #0c0d11;
--bg-raised: #111318;
--panel: #16181f;
--panel-2: #1c1f28;
--border: rgba(255,255,255,.08);
--border-strong: rgba(255,255,255,.14);
--text: #ededf0;
--text-sec: #b0b4be;       /* Note: codebase may use --text-secondary */
--muted: #71767f;
--accent: #c98a3a;         /* gold — primary CTA */
--accent-2: #7cacf8;       /* blue — links, secondary */
--good: #3dce8a;
--warn: #e5b84c;
--bad: #ef5350;

/* Light theme — applied via [data-theme="light"] on <html> */
--bg: #f4f4f7;
--bg-raised: #ffffff;
--panel: #ffffff;
--panel-2: #eeeef2;
--border: rgba(0,0,0,.09);
--border-strong: rgba(0,0,0,.16);
--text: #1a1a1e;
--text-sec: #4a4a52;
--muted: #72727c;
```

Font: Inter (Google Fonts) · strokeWidth on SVG icons: 1.4–1.5 · no fill icons

---

## Opening the DC design files

All `.dc.html` files open directly in a browser — no build step. Just double-click or `open filename.dc.html`.

**MTG Workshop Phase 2.dc.html** — use the Tweaks panel (top-right ⚙) to:
- Switch **Dark ↔ Light** theme
- Isolate a single frame (A through H) to focus on one screen

Pan/zoom with trackpad or mouse drag on the canvas.
