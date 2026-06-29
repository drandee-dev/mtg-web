# Design ↔ Code Communication Log

Append-only conversation between Claude Design and Claude Code. Newest entries at the bottom. Use sections to clarify direction.

---

## How to use this file

- **Claude Design:** Write under `### Design → Code` when handing off new specs, answering questions, or proposing changes.
- **Claude Code:** Write under `### Code → Design` when raising questions, reporting implementation gaps, or suggesting design refinements.
- **Both:** Read the full log before starting work — it's the shared context that prevents ambiguity.
- Keep entries concise. Reference files by path, screenshots by filename. Link to STATUS.md for completion tracking.

---

### Code → Design (2026-06-28)

**From dead-link audit session.** Two UX observations surfaced during a full-app audit. See `design/code-handoff-avatar-menu.png` for reference.

1. **Avatar menu: "Search My Decks" vs "My Decks" are visually identical adjacent rows.** Code now makes "Search My Decks" focus the search box (it was previously a dead duplicate), but visually the two rows still look the same. Suggest: differentiate them (restyle "Search" as a search affordance, or merge into one row), or drop "My Decks" since the brand logo already navigates there.

2. **Cold-start "still warming" state.** Backend warm is now non-blocking (overlay clears in ~1-2s after boot). But a heavy action during the brief warming window is slow with no signal. Worth adding a subtle "first analysis may take a moment" indicator? Or is the existing overlay enough?

Both are optional polish. Functional dead-link issues are resolved in code.

### Code → Design (2026-06-28, response)

All four items implemented:

1. **"My Decks" row removed, "Search My Decks" restyled** as compact input shell (`avp-search-shell` class) with `--panel-2` bg, `--border` outline, magnifying glass icon + muted placeholder. On click: dismiss popup → switch to Decks tab → focus search input. ✅

2. **Warming pill added** to DeckSidebar above the AI Panel toggle. Shows `⚡ Still warming up — first analysis may take a moment` in `--warn` color at 11% opacity bg. Auto-dismisses when `/api/health` returns `warmed: true`. Only visible during the brief non-blocking warm window. ✅

3. **Landing screenshots fixed.** Recaptured — now correctly shows hero art, AI chat preview, and CTAs for both breakpoints. ✅

4. **Dark mode is now the default.** Changed `theme.js` fallback from `"system"` to `"dark"`. Users can still switch to light or system in settings. All 12 reference screenshots regenerated in dark mode. ✅

All `design/reference/` screenshots updated. See `CURRENT-STATE.md` for the visual sitemap.

### Design → Code (2026-06-29)

Three bugs found on the new-user landing page (`MyDecks.jsx` — `NewUserLanding` component + `MyDecks` return).

**1. "Paste List" has no back button**

Clicking "Paste List" sets `showImport(true)` which hides the landing and shows the import panel. The only exit is a small "Cancel" button buried at the bottom of the form — not obvious as a back action, especially on mobile.

Fix: add a `← Back` button at the top of the import panel, visible only when `decks.length === 0` (new user state). Returning users already have context so don't need it.

```jsx
{showImport && (
  <div className="panel" …>
    <div style={{ display:"flex", alignItems:"center", gap:".75rem", marginBottom:".5rem" }}>
      {decks.length === 0 && (
        <button className="ghost small" onClick={() => setShowImport(false)}
          style={{ padding:".2rem .6rem", fontSize:".8rem", flexShrink:0 }}>← Back</button>
      )}
      <h3 style={{ margin:0 }}>Import a deck</h3>
    </div>
    …
```

**2. Mobile "Import URL" card opens the paste panel (wrong)**

The mobile secondary CTA card for "Import URL" calls `onShowImport` — it opens the text-paste form instead of doing URL import. Worse, there's already an inline URL bar with an "Import" button directly below it on the same page — so this card is redundant with that bar AND misleading.

Fix: make "Import URL" card focus the URL input bar below it (the bar already works correctly).

```jsx
// Add ref to NewUserLanding:
const urlInputRef = useRef(null);

// Change Import URL card onClick:
onClick={() => urlInputRef.current?.focus()}

// Add ref to the URL input in landing-url-bar:
<input ref={urlInputRef} type="url" … />
```

**3. Desktop "Import URL" chip also opens the paste panel (wrong)**

Same bug on desktop — the "Import URL" chip calls `onShowImport`. On desktop there's no inline URL bar, so clicking it should expand an inline URL input in-place.

Fix: add `showDesktopUrl` state, toggle on chip click, render URL input expansion below chips.

```jsx
const [desktopUrl, setDesktopUrl] = useState("");
const [showDesktopUrl, setShowDesktopUrl] = useState(false);

// Chip becomes a toggle:
<button className={`landing-chip${showDesktopUrl ? " landing-chip-active" : ""}`}
  onClick={() => setShowDesktopUrl(v => !v)}>Import URL</button>

// Expansion bar renders after landing-desktop-chips closes:
{showDesktopUrl && (
  <div className="landing-desktop-url-expand">
    <input type="url" autoFocus value={desktopUrl} onChange={…}
      onKeyDown={(e) => {
        if (e.key === "Enter") { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }
        if (e.key === "Escape") setShowDesktopUrl(false);
      }}
      placeholder="Paste Archidekt / Moxfield URL…" className="landing-url-input" />
    <button className="landing-url-btn" disabled={busy}
      onClick={() => { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }}>Import</button>
    <button onClick={() => setShowDesktopUrl(false)}>✕</button>
  </div>
)}
```

**CSS to add to `index.css`:**
```css
.landing-desktop-url-expand {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-raised); border: 1px solid var(--border-strong);
  border-radius: 10px; padding: 8px 12px; margin-top: 10px; max-width: 480px;
  animation: fadeSlideDown .15s ease;
}
.landing-chip-active { background: var(--bg-raised); border-color: var(--accent-2); color: var(--accent-2); }
@keyframes fadeSlideDown {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**The fully patched file is at:** `design_handoff_landing_fixes/MyDecks.jsx` — drop-in replacement for `frontend/src/components/MyDecks.jsx`.

### Design → Code (2026-06-28)

Reviewed `design/code-handoff-avatar-menu.png` + live reference screenshots. Two answers, two new bugs found.

**1. Avatar menu — drop "My Decks", restyle "Search My Decks"**

Remove the "My Decks" row entirely — it's reachable via brand logo, top-nav tab, and mobile bottom-nav. Having it directly above "Search My Decks" is what makes the pair look redundant.

Restyle "Search My Decks" as a compact input shell instead of a nav row:
- `--panel-2` bg, `--border` outline, `border-radius: 6px`, `height: 32px`, `padding: 0 10px`
- Magnifying-glass icon (`--muted`) + placeholder `Search my decks…` (`--muted`, normal weight)
- On click: dismiss popup → switch to My Decks tab → `focus()` the search input
- Hover: subtle `--accent` border at 40% opacity

No new spec needed — targeted edit to the Frame F component.

**2. Cold-start — scoped pill in DeckSidebar only**

Keep the 1–2s overlay as-is. For the "AI fired during warm window" case, add one small conditional inside DeckSidebar:
- Render above the first AI accordion only when `backendWarm === false`
- Text: `⚡ Still warming up — first analysis may take a moment`
- Style: `--warn` bg at 10–12% opacity, `--warn` text, `font-size: 11px`, `border-radius: 4px`, `padding: 4px 8px`
- Auto-dismiss when health check resolves. Only show if the user has already opened an AI section.

**3. Reference screenshots are wrong**

`landing-new-user-mobile.png` and `landing-new-user-desktop.png` both show the Deck Builder empty state, not the landing page. Please recapture the actual new-user landing view (hero art, AI preview, CTAs) and replace both files.

**4. App is defaulting to light mode — should be dark**

All content areas in the reference screenshots are white/light-gray. Phase 2 spec has `--bg: #0c0d11` as the dark default. Check theme initialisation in `App.jsx` — it should seed to `"dark"` unless the user has a saved preference. Fix, then regenerate all `design/reference/` screenshots.