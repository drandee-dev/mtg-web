import { useRef } from "react";
import AvatarPopup from "./AvatarPopup";
import NavLink from "./NavLink";
import { loadDirectory } from "../../lib/commanderDirectory";

// Per-place data to warm on hover, keyed by place id. Only Commanders has a
// heavy fetch worth starting early (~500KB post-compression, see
// Commanders.jsx); every other place's data is small or already loaded.
const PREFETCH = { commanders: loadDirectory };

// The bar names the four places. "New deck" and the account menu sit beside
// them as actions. `place` is the place the screen belongs to (a deck is a
// page under Decks), or null on the New deck screen.
export default function GlobalToolbar({
  places, place, setTab, cloud, session,
  setSettingsOpen, onNewDeck, onDeck, onSignOut,
  avatarMenuOpen, setAvatarMenuOpen, onFeedback,
}) {
  const avatarRef = useRef(null);
  const initials = cloud
    ? session.user.email.slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="global-toolbar" role="banner">
      <NavLink className="gt-brand" href="/" onNavigate={() => setTab("decks")}>
        <span className="gt-logo-dot" aria-hidden="true" />
        <span className="gt-logo-text">MTG Workshop</span>
      </NavLink>

      <nav className="gt-nav" aria-label="Main">
        {places.map(([id, label, href]) => (
          <NavLink
            key={id}
            href={href}
            current={place === id}
            className="gt-link"
            onNavigate={() => setTab(id)}
            onMouseEnter={() => PREFETCH[id]?.()}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="gt-right">
        {/* The gold button is the screen's main action: on a deck that is Save. */}
        <NavLink className={`gt-new${onDeck ? " gt-new-quiet" : ""}`} href="/new" onNavigate={onNewDeck}>
          New deck
        </NavLink>
        <div className="gt-user-wrap">
          <button
            ref={avatarRef}
            className={`gt-avatar${avatarMenuOpen ? " active" : ""}`}
            onClick={() => setAvatarMenuOpen((s) => !s)}
            aria-label="Account menu"
            aria-expanded={avatarMenuOpen}
            aria-controls="account-menu"
          >
            {initials}
          </button>
          {avatarMenuOpen && (
            <AvatarPopup
              session={session}
              triggerRef={avatarRef}
              onAccountSettings={() => { setAvatarMenuOpen(false); setSettingsOpen(true); }}
              onSignOut={onSignOut}
              onFeedback={onFeedback}
              onClose={() => setAvatarMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </header>
  );
}
