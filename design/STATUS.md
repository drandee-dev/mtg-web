# Implementation Status

> Last updated: 2026-06-27 — Phase 2 complete

## Phase 2 (MTG Workshop Phase 2.dc.html)

| Frame | Feature | Status | Notes |
|-------|---------|--------|-------|
| A | Landing - Mobile (new user) | Done | Hero art, AI chat preview, 3 secondary CTAs, URL import bar |
| B | Landing - Desktop (new user) | Done | Two-column hero split, AI chat preview card |
| C | My Decks - Mobile (returning) | Done | Filter toolbar: search, format, sort, direction |
| D | My Decks - Desktop (returning) | Done | 4-col grid, deck hover overlay (Edit/Playtest/Export), inline URL import |
| E | Card hover actions | Done | 3-button overlay (Remove/Consider/Scryfall) on grid + stack views, mobile bottom sheet |
| F | Avatar dropdown popup | Done | Actions/Navigation/Recent/Account sections, outside-click dismiss |
| G | Deck editor toolbar | Done | Consolidated row: Add card, Quick add, View/Group/Sort, Syntax filter, Save + completeness badge |
| H | Account modal | Done | Signed-in/out states, tinted callout boxes, masked API key, theme switcher |

## Phase 1 (design_handoff_mtg_workshop)

| Feature | Status | Notes |
|---------|--------|-------|
| Stack view component | Done | StackView.jsx — Archidekt-style overlapping columns, hover expand |
| Deck builder 3-col layout | Existing | DeckView.jsx already has sidebar + main + search layout |
| AI panel sections | Existing | DeckSidebar.jsx has analysis/suggestions/budget tabs |
| Rules Q&A | Existing | Rules.jsx chat interface |
| Mobile deck view | Existing | Responsive layout with bottom nav |

## Phase 3: Archidekt-style stack view + testing (June 2026)

| Feature | Status | Notes |
|---------|--------|-------|
| Text stack (Archidekt-faithful) | Done | 26px rows: qty + name + CSS mana pips, per-column price totals |
| Image stack improvements | Done | 180px columns, push-down hover (cards below slide down), accent ring |
| Image/Text sub-toggle | Done | Appears only when Stacks view active, styled like AI panel toggle |
| Drag-and-drop: column reorder | Done | All group-by modes, counter-based dragLeave, localStorage persistence |
| Drag-and-drop: card move | Done | Role mode only, per-deck overrides in localStorage keyed by deck id |
| Mobile touch menus | Done | ⋯ menus replace drag (column left/right + card "move to category"), row actions always visible |
| ManaCost.jsx pips | Done | CSS circles, WUBRG colors, hybrid/Phyrexian support, no font dependency |
| Backend mana_cost | Done | Added to /api/cards/image response |
| E2E test suite | Done | 56 Playwright tests (desktop + mobile), hermetic mock, Codex runner |

## Ready for next design iteration

All Phase 2+3 are implemented. Areas that could benefit from design refinement:
- Playtest mode UI (no design spec yet)
- Deck sharing/export flow
- Onboarding wizard (referenced in landing CTAs but not spec'd)
- Mobile: toolbar avatar overlaps deck-nav ⋯ button (z-index stacking)

## Design ↔ Code round-trip (2026-06-28)

| Item | Design direction | Code status |
|------|-----------------|-------------|
| Avatar: drop "My Decks", restyle "Search" as input shell | Compact input with `--panel-2` bg, `--border` outline, 32px height | Done |
| Warming pill in DeckSidebar | `--warn` bg at 11% opacity, auto-dismiss on `warmed: true` | Done |
| Landing screenshots wrong (showed deck builder) | Recapture actual new-user landing | Done — 12 screenshots regenerated |
| App defaulting to light mode | Should be dark per Phase 2 spec | Done — default changed to `"dark"` |

See `COMMS.md` for full discussion thread.

## Landing page bug fixes (2026-06-29)

| Bug | Description | Code status |
|-----|-------------|-------------|
| Paste List no back button | Import panel hides landing with no obvious return — add `← Back` for new users | Done |
| Mobile "Import URL" opens paste panel | Should focus the inline URL bar below, not open text-paste form | Done |
| Desktop "Import URL" opens paste panel | Should expand inline URL input in-place with Enter/Escape/✕ support | Done |

Patched `MyDecks.jsx` provided in `design/Landing page bug fixes/design_handoff_landing_fixes/`. Also requires 3 new CSS classes in `index.css`. See `COMMS.md` → Design → Code (2026-06-29) for full spec.
