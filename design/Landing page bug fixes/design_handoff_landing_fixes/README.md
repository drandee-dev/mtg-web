# Handoff: Landing Page Bug Fixes — Paste List & Import URL

## Overview
Three UX bugs on the new-user landing page in `MyDecks.jsx`:

1. **"Paste List" has no back button** — clicking it hides the landing and shows the import panel, but there is no obvious way to return to the landing page.
2. **"Import URL" mobile card opens the paste panel** — it should focus the inline URL bar directly below it.
3. **"Import URL" desktop chip also opens the paste panel** — it should expand an inline URL input, not the text-paste form.

The fixed file is included in this folder as `MyDecks.jsx`. Apply it by replacing `frontend/src/components/MyDecks.jsx` in the mtg-web repo.

---

## Files
| File | Purpose |
|------|---------|
| `MyDecks.jsx` | Drop-in replacement for `frontend/src/components/MyDecks.jsx` |

---

## Changes Made

### Fix 1 — `← Back` button on the import panel (new users)
**Location:** `MyDecks` component return, the `{showImport && …}` block (~line 360)

**Before:**
```jsx
{showImport && (
  <div className="panel" style={{ marginBottom: "1rem" }}>
    <h3>Import a deck</h3>
```

**After:**
```jsx
{showImport && (
  <div className="panel" style={{ marginBottom: "1rem" }}>
    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".5rem" }}>
      {decks.length === 0 && (
        <button className="ghost small" onClick={() => setShowImport(false)}
          style={{ padding: ".2rem .6rem", fontSize: ".8rem", flexShrink: 0 }}>
          ← Back
        </button>
      )}
      <h3 style={{ margin: 0 }}>Import a deck</h3>
    </div>
```

The `← Back` button only renders when `decks.length === 0` (new user / landing state). Returning users already have context and don't need it.

---

### Fix 2 — "Import URL" mobile card focuses the URL bar
**Location:** `NewUserLanding` component, mobile secondary CTAs section

**Added state/ref:**
```jsx
const urlInputRef = useRef(null);
```

**Changed onClick** from `onShowImport` to:
```jsx
onClick={() => urlInputRef.current?.focus()}
```

**Added ref to the URL input** in the `landing-url-bar` div below:
```jsx
<input ref={urlInputRef} type="url" … />
```

Clicking "Import URL" now scrolls to and focuses the URL bar that already exists on the page, instead of opening the unrelated paste panel.

---

### Fix 3 — "Import URL" desktop chip expands inline URL input
**Location:** `NewUserLanding` component, `landing-desktop-chips` section

**Added state:**
```jsx
const [desktopUrl, setDesktopUrl] = useState("");
const [showDesktopUrl, setShowDesktopUrl] = useState(false);
```

**Changed chip button** from `onClick={onShowImport}` to a toggle:
```jsx
<button
  className={`landing-chip${showDesktopUrl ? " landing-chip-active" : ""}`}
  onClick={() => setShowDesktopUrl((v) => !v)}
>
```

**Added URL expansion bar** directly after the `landing-desktop-chips` div closes:
```jsx
{showDesktopUrl && (
  <div className="landing-desktop-url-expand">
    <svg … />  {/* link icon */}
    <input
      type="url"
      autoFocus
      value={desktopUrl}
      onChange={(e) => setDesktopUrl(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }
        if (e.key === "Escape") setShowDesktopUrl(false);
      }}
      placeholder="Paste Archidekt / Moxfield URL…"
      className="landing-url-input"
    />
    <button className="landing-url-btn" disabled={busy}
      onClick={() => { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }}>
      {busy ? "Importing…" : "Import"}
    </button>
    <button className="landing-chip" style={{ padding: "5px 10px" }}
      onClick={() => setShowDesktopUrl(false)}>✕</button>
  </div>
)}
```

Supports Enter to import, Escape to dismiss, and ✕ button.

---

## CSS to add
Two new utility classes are referenced. Add these to `index.css` (or the relevant CSS file):

```css
/* Desktop landing — inline URL expand bar */
.landing-desktop-url-expand {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 8px 12px;
  margin-top: 10px;
  max-width: 480px;
  animation: fadeSlideDown .15s ease;
}

/* Active state for Import URL chip when expanded */
.landing-chip-active {
  background: var(--bg-raised);
  border-color: var(--accent-2);
  color: var(--accent-2);
}

@keyframes fadeSlideDown {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## No other files need changing
- `App.jsx` — no changes needed; the `onImportUrl` prop already threads `doImportUrl` correctly down to `NewUserLanding`
- `AvatarPopup.jsx` — "Import URL" there navigates to the Decks tab and sets `decksIntent: "import"` which opens the paste panel. This is a separate issue not covered here; the avatar popup use-case is different (user already has decks).
