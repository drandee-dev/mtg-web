# New Deck Flow Redesign — Spec

**Date:** 2026-07-01 · **Status:** Mockup awaiting user approval — DO NOT implement until approved.
**Prototype:** `new-deck-flow.dc.html` (open in browser; 4 frames via top nav, avatar dropdown + import modal are interactive).
**Reference:** `Archidekt screenshots provided in session — home page w/ avatar menu, deck view header.`

## Problem

Building a deck from scratch is not user friendly: `newDeck()` (App.jsx) drops the user into a blank editor with no import affordance. Paste/URL import only exists on the MyDecks landing page; the avatar dropdown is a sync-status panel with no navigation or quick actions.

## Decisions locked with user (2026-07-01)

- Scope: all four surfaces (creation flow, avatar dropdown, deck header, MyDecks controls).
- "New deck" → **straight to empty editor** (no setup dialog); deck starts as "Untitled Deck", renamed inline.
- Avatar dropdown recent decks: **art thumbnails** (reuse commander-art fetch from MyDecks hero cards).
- **Folders: OUT of scope** — future phase, do not build the data model yet.

## Frame 1 — My Decks page

- Controls row: filter-by-name input (client-side, instant), Sort select (Recently updated / Name / Format / Price), grid⇄list segmented toggle, **New Deck** primary CTA (right-aligned).
- Deck grid gains a dashed **"＋ New Deck" tile** as the first cell (same action as CTA).
- Deck count next to the "My Decks" heading.
- Existing deck-card hover actions / ⋯ menu unchanged.

## Frame 1b — Avatar dropdown (replaces current account panel's nav role)

Three sections, top to bottom:
1. **Quick actions:** New deck, Search my decks (focuses the Frame-1 filter input), My decks.
2. **Recent decks:** label + scrollable list (max ~8, most recently updated), each row = 34px art thumb + name + format. Click → open deck.
3. **Account:** avatar + email + "● Synced · N decks" line, then Sign out (red).

Signed-out state: sections 1 keeps New deck only; section 3 shows the existing sign-in form entry point. Existing sync callouts/settings move behind the account row (or stay in Settings) — keep this dropdown navigation-first.

## Frame 2 — Empty deck editor (the core fix)

Clicking New Deck (anywhere) lands here immediately:
- Header: "Untitled Deck" + hover ✎ rename, stats line "Commander · 0 cards", **Import cards** (primary) + ⋯.
- Body: 4 stacked action cards — **Paste a decklist**, **Import from URL**, **Search for cards**, **Guided build** (existing wizard, kept as an entry point). First two open the Import modal on the matching tab; Search focuses card search; Guided build routes to Wizard.
- Empty state disappears once the deck has ≥1 card.

## Frame 3 — Import cards modal

- Two tabs: **Paste decklist** (textarea, accepts Arena/Moxfield/Archidekt/plain text — existing parser) and **From URL** (input, existing `/api/deck/import-url`, Archidekt + Moxfield badges).
- Same modal is reachable from a **populated** deck (header button): imported cards **merge/append** into the current deck; on the empty deck it also imports name/format when the source provides them (URL imports).
- Footer: Cancel / Import. Import busy state on the primary button.

## Frame 4 — Deck-view header (populated) + toolbar consolidation

- Top-left: title (inline rename), stats row: `Commander · ✓ Legal · Bracket: Core (2) · 100/100 · Est. $431.67 · Updated 27h ago`. Legality/bracket use existing analyze data; the `100/100` chip is the current completeness badge relocated. **No views/likes/salt** (no backend for social stats).
- Top-right actions: **Import cards**, **Playtest**, **⋯** (Share / Clone / Export / Lock / Delete — absorbs current MoreMenu), **Save** (primary, rightmost — relocated from cg-toolbar).

### ⚠ ONE toolbar, not two (user requirement 2026-07-01)

The header's toolbar row **IS CardGrid's existing `cg-toolbar` relocated/restyled** — do not render a new row above it. Migration map:

| Current location | Element | New home |
|---|---|---|
| `cg-toolbar` | Add card (Card search btn), Quick add, View as, Stack as, Group by, Sort by, Filter deck | **Stays** — this row becomes the header's toolbar (only restyled/repositioned) |
| `cg-toolbar-right` | Save button | Header actions (primary, rightmost) |
| `cg-toolbar-right` | Completeness badge | Header stats row (`100/100` chip) |
| Commander strip (`cmdr-strip`) | count /100, price, bracket | Header stats row; strip itself is **removed** — commander identity is already covered by the crowned commander column in the grid |
| `category-tabs` | All / Creatures / Instants / … | **Unchanged**, renders below the toolbar |
| `DeckInput` | Search bar + filter chips | Unchanged behavior — hidden until Card search invoked (`toggleSearch`) |

Implementation note: the toolbar markup can stay inside CardGrid (props unchanged) with the header component rendered above it in DeckView, OR the toolbar lifts into DeckView — implementer's choice, but the DOM must contain exactly one View-as/Group-by/Sort-by control set. Save/completeness props move from CardGrid to the new header either way.

## Out of scope (documented future upgrades)

- Deck folders (needs Supabase `decks.folder` column + localStorage schema change).
- Community/social stats (views, likes, salt sum).
- Card packages / deck sandbox.

## Implementation order (after approval)

1. Import modal component (reuse existing paste parser + import-url API) — unblocks everything.
2. Empty-deck state in DeckView + "straight to editor" newDeck().
3. Deck header + toolbar consolidation (remove cmdr-strip, relocate Save/completeness, single cg-toolbar under header).
4. Avatar dropdown rework.
5. MyDecks controls row (filter/sort/view toggle + CTA/tile).
