import { useState, useRef, useEffect } from "react";

export default function GlobalToolbar({
  tabs, tab, setTab, cloud, session, supabaseEnabled,
}) {
  const [showUser, setShowUser] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    if (!showUser) return;
    function close(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setShowUser(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showUser]);

  const userLabel = cloud
    ? session.user.email
    : supabaseEnabled
      ? "Not signed in"
      : "Local mode";

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
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="gt-right">
        <div className="gt-user-wrap" ref={popRef}>
          <button
            className="gt-avatar"
            onClick={() => setShowUser((s) => !s)}
            aria-label="Account info"
          >
            {initials}
          </button>
          {showUser && (
            <div className="gt-user-pop">
              <span className="gt-user-label">{userLabel}</span>
              {cloud && (
                <span className="gt-cloud-badge">Cloud sync</span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
