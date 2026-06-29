# Handoff: MTG Workshop Phase 2 — Landing & UX Polish

## Overview
Phase 2 covers four major UX improvements to MTG Workshop:
1. **Landing page redesign** — new-user hero with 4 entry points (AI, Import URL, Paste Decklist, Guided Wizard)
2. **My Decks returning-user view** — Archidekt-style filter toolbar, deck card hover actions, inline URL import
3. **Card thumbnail hover actions** — expanded 3-button overlay (Remove / Consider / Scryfall) + mobile bottom sheet
4. **Account modal** — signed-in vs. signed-out states, cloud sync prominence, API key explanation, theme switcher
5. **Avatar dropdown popup** — Archidekt-inspired popup with action sections + recent decks with art thumbnails
6. **Deck editor toolbar redesign** — labeled section groups replacing unlabeled icon clusters

## About the Design Files
The files in this bundle are **HTML design references** — high-fidelity prototypes showing intended look, layout, and behavior. They are NOT production code to copy directly. The task is to **recreate these designs inside the existing React/Vite codebase** (`mtg-web/frontend/`) using its established patterns, components, and CSS tokens.

Design file: `MTG Workshop Phase 2.dc.html` (pannable canvas with 8 labeled frames A–H)

## Fidelity
**High-fidelity.** Pixel-precise colors, typography, spacing, and component states. Recreate as close as possible using the existing design token system.

---

## Design Tokens (all CSS vars already in codebase)
```
--bg:         #0c0d11
--bg-raised:  #111318
--panel:      #16181f
--panel-2:    #1c1f28
--accent:     #c98a3a   (primary gold)
--good:       #3dce8a
--warn:       #e5b84c
--bad:        #ef5350
--accent-2:   #7cacf8
--text:       #ededf0
--text-sec:   #b0b4be
--muted:      #71767f
--border:     rgba(255,255,255,.08)
--border-strong: rgba(255,255,255,.14)
Font: Inter 400/500/600/700
```

Light theme overrides (apply via `[data-theme="light"]` on `<html>`):
```
--bg: #f4f4f7; --bg-raised: #ffffff; --panel: #ffffff; --panel-2: #eeeef2;
--border: rgba(0,0,0,.09); --border-strong: rgba(0,0,0,.16);
--text: #1a1a1e; --text-sec: #4a4a52; --muted: #72727c;
```

---

## Screens / Frames

### Frame A — Landing · New User · Mobile (375px)
**File:** `MTG Workshop Phase 2.dc.html` — Frame A (top-left of canvas)
**Purpose:** First-time visitor on mobile — orient them to the 4 ways to start

**Layout:** Full-screen flex column
- TopBar (44px): logo + "Sign In" button
- Hero art banner (178px): `art_crop` image, gradient overlay to `--bg`, headline + subtext overlaid bottom-left
- Scroll body (flex:1): padded 16px
  - Primary CTA card: `--panel` bg, gold border, radial glow, AI badge, mini chat preview (2 messages + card rows), "Start Building →" gold button
  - "Or start another way" label
  - 3-column secondary CTAs: Import URL (blue icon), Paste List (green icon), Guided (yellow icon) — each 28px icon in tinted circle, name + subtext
  - URL inline import bar: link icon + placeholder + gold "Import" button
- BottomNav (60px): 5 tabs, AI tab active gold

### Frame B — Landing · New User · Desktop (1280px)
**File:** Frame B
**Purpose:** Same as A but desktop — hero split layout

**Layout:** Full viewport
- GlobalToolbar (44px): logo + nav links + "Sign In" button + avatar circle
- Hero: two-column flex
  - Left 54%: badge pill, 54px headline, subtext, primary "Start with AI" button + secondary "See how it works", row of 3 secondary CTA chips, URL import row, "Free to start" footnote
  - Right 46%: AI chat preview card — header with avatar + online dot + format badge, message thread with card suggestion rows (art_crop thumbnails + name + synergy %), input bar

### Frame C — My Decks · Returning · Mobile (375px)
**File:** Frame C
**Purpose:** Signed-in user's deck list on mobile

**Layout:** Full-screen flex column
- TopBar: logo + "My Decks" title + gold `+` button + avatar circle
- Filter toolbar: search input (flex:1) + "All" dropdown + "Updated" dropdown
- 2-column deck grid (gap:10px): each card = art_crop thumbnail (88px) + color pip badges + name + format badge + card count + timestamp + 3-dot menu button
- Deck card 2 shows 3-dot dropdown **open**: Rename / Export / Playtest / Delete (red)
- BottomNav: Decks tab active gold

### Frame D — My Decks · Returning · Desktop (1280px)
**File:** Frame D
**Purpose:** Signed-in user's deck list on desktop

**Key additions vs current UI:**
1. **Inline URL import** in GlobalToolbar (right side, before New Deck button): 280px input + gold "Import" button
2. **Archidekt-style filter toolbar** below page header:
   - Labeled sections with 9px uppercase labels above each control
   - Search (flex:1) | Format dropdown (130px min) | Sort by dropdown (130px min) | Dir button
   - All controls: `--bg-raised` bg, `--border` border, 7px radius, 12px text
3. **4-column deck grid** (gap:14px): taller art (120px), Edit/Playtest/Export **hover overlay** on card art (3 buttons centered, semi-transparent bg)
4. Deck card "just now" shows green dot

### Frame E — Card Thumbnail Hover Actions
**File:** Frame E
**Purpose:** Shows old (×-only) vs. new (3-button) hover overlay, plus mobile sheet

**Desktop hover overlay** (new behavior):
- Triggered on `mouseenter` on the card thumbnail
- Gradient from bottom: `linear-gradient(to top, rgba(0,0,0,.95) 0%, transparent 100%)` — height 52% of card
- 3 equal-width buttons in a row at bottom:
  - Remove: `rgba(239,83,80,.2)` bg, red icon+label
  - Consider: `rgba(255,255,255,.1)` bg, gray icon+label
  - Scryfall: `rgba(124,172,248,.12)` bg, blue icon+label, external-link icon
- On `mouseleave` overlay fades out

**Mobile bottom sheet** (tap to open):
- Tap card row → show bottom sheet below the row
- 3px drag handle pill centered
- 3 equal-width buttons (same colors as desktop) but larger: 16px icons, 10px labels, 10px padding

### Frame F — Avatar Dropdown Popup
**File:** Frame F
**Purpose:** New popup replacing plain avatar → settings nav

**Trigger:** Click avatar in GlobalToolbar
**Dimensions:** ~240px wide, positioned top-right below avatar
**Sections (separated by 1px dividers):**
1. **Actions:** New Deck / Import URL (gold "New" badge) / Paste Decklist
2. **Navigation:** Search My Decks / My Decks
3. **Recent** (labeled): 3 recent decks with 28×20px art_crop thumbnail, name, card count right-aligned
4. **Account:** Account Settings / Sign Out (red)

### Frame G — Deck Editor Toolbar Redesign
**File:** Frame G
**Purpose:** Before/after showing Archidekt-inspired labeled toolbar

**New toolbar structure** (single row, `--panel` bg, 10px 14px padding):
```
[Add card: Card search btn] [Quick add: inline input + ⚙] | [View as: dropdown + ⚙] [Group by: dropdown] [Sort by: dropdown] | [Syntax filter: text input + search + ⚙] [Save]
```
- Each group has a 9px uppercase label above
- Vertical 1px dividers separate groups
- "View as" active value shows in gold
- Syntax filter: placeholder `Filter deck (eg. o:haste c:red)` with `?` help button

**Files to edit:**
- `mtg-web/frontend/src/components/deck/DeckToolbar.jsx` (or equivalent)
- `mtg-web/frontend/src/index.css`

### Frame H — Account Modal
**File:** Frame H (left:1400px, top:1940px on canvas)
**Purpose:** Signed-out and signed-in states of the account/settings modal

**Signed-out state:**
- Cloud sync callout: blue tinted box, prominent "Sign in to enable cloud sync" + explanation
- Magic-link sign-in (email input + "Send magic link" button + "No password required" note)
- Theme switcher: 3-segment (Light / **Dark** / System), Dark active
- API key field: placeholder `sk-ant-... (optional, for AI features)` + explanation that key is stored locally

**Signed-in state:**
- Avatar circle with initial, email, green "● Synced" dot
- Cloud sync status: green tinted box, "Cloud sync active · 4 decks · Last synced just now" + refresh icon
- Theme switcher (same)
- API key: monospace masked display `sk-ant-••••…` + "Change" button + "Active" green badge
- Footer row: "Send feedback ↗" link + "Sign Out" ghost button

---

## Interactions & Behavior

### Landing page entry points
- "Start with AI" → opens AI panel / new deck flow with AI pre-selected
- "Import URL" card/chip → focuses a URL input field
- "Paste Decklist" → opens paste modal
- "Guided Wizard" → opens step-by-step deck creation flow

### Deck card 3-dot menu (mobile)
- Tap ··· → dropdown appears below card, closes on outside tap
- Options: Rename, Export, Playtest, Delete (red, shows confirm)

### Deck card hover overlay (desktop)
- `mouseenter` on `.deck-card-art` → fade in overlay (transition: opacity 150ms)
- Edit → navigate to deck editor
- Playtest → open playtest modal
- Export → open export sheet

### Card thumbnail hover (deck editor)
- `mouseenter` on `CardThumbnail` → show 3-button gradient overlay
- Remove → remove card from deck
- Consider → move to "Considering" list
- Scryfall → `window.open('https://scryfall.com/search?q=${encodeURIComponent(cardName)}', '_blank')`

### Avatar dropdown
- Click avatar → toggle dropdown visibility
- Click outside → close
- "Import URL" item → open URL import modal/inline input
- Recent deck rows → navigate to that deck

---

## State Management

### Landing page
```js
// No new state — landing shows entry points only
// New user = !user && decks.length === 0
// Returning user = user || decks.length > 0
```

### My Decks filter toolbar
```js
const [search, setSearch] = useState('');
const [format, setFormat] = useState('all');
const [sortBy, setSortBy] = useState('updatedAt');
const [sortDir, setSortDir] = useState('desc');
```

### Card thumbnail hover
```js
const [hovered, setHovered] = useState(false);
// onMouseEnter → setHovered(true), onMouseLeave → setHovered(false)
```

### Avatar dropdown
```js
const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
// Add to GlobalToolbar.jsx
```

---

## Files to Edit in `mtg-web/`

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Show new-user landing when `decks.length === 0 && !loading` |
| `frontend/src/components/layout/GlobalToolbar.jsx` | Add avatar dropdown popup + inline URL import input |
| `frontend/src/components/deck/CardGrid.jsx` | Replace toolbar with labeled Archidekt-style toolbar |
| `frontend/src/components/deck/CardListRow.jsx` | Add hover overlay with 3 action buttons |
| `frontend/src/components/MyDecks.jsx` (or equivalent) | Add filter/sort toolbar + deck card hover overlay |
| `frontend/src/index.css` | Add theme switcher tokens, light theme overrides |

---

## Assets
- Card art: Scryfall CDN `https://cards.scryfall.io/art_crop/front/{s1}/{s2}/{uuid}.jpg`
- Icons: inline SVG stroke icons, strokeWidth 1.4–1.5, no fill — same style as `BottomNav.jsx`

## Design Reference File
`MTG Workshop Phase 2.dc.html` — open in browser, pan/zoom to explore all 8 frames.
