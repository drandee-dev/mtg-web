import AvatarPopup from "./AvatarPopup";

const TAB_ICONS = {
  decks: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  deck: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  rules: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 3.5v10M8 3.5C8 3.5 6.5 2 3 2v10c3.5 0 5 1.5 5 1.5M8 3.5C8 3.5 9.5 2 13 2v10c-3.5 0-5 1.5-5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  cards: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

export default function GlobalToolbar({
  tabs, tab, setTab, cloud, session,
  setSettingsOpen,
  decks, onNewDeck, onImportUrl, onSearchDecks, onOpenDeck, onPasteDecklist, onSignOut,
  avatarMenuOpen, setAvatarMenuOpen, onFeedback,
}) {
  const initials = cloud
    ? session.user.email.slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="global-toolbar" role="banner">
      <div className="gt-left">
        <button
          className="gt-brand"
          onClick={() => setTab("decks")}
          aria-label="Go to My Decks"
        >
          <span className="gt-logo-dot" />
          <span className="gt-logo-text">MTG Workshop</span>
        </button>
      </div>

      <nav className="gt-nav" role="tablist" aria-label="Main navigation">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`gt-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            {TAB_ICONS[id]}{label}
          </button>
        ))}
      </nav>

      <div className="gt-right">
        <div className="gt-user-wrap">
          <button
            className={`gt-avatar${avatarMenuOpen ? " active" : ""}`}
            onClick={() => setAvatarMenuOpen((s) => !s)}
            aria-label="Account menu"
          >
            {initials}
          </button>
          {avatarMenuOpen && (
            <AvatarPopup
              decks={decks}
              session={session}
              onNewDeck={onNewDeck}
              onImportUrl={onImportUrl}
              onSearchDecks={onSearchDecks}
              onOpenDeck={onOpenDeck}
              onPasteDecklist={onPasteDecklist}
              setTab={setTab}
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
