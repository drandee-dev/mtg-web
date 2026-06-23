export default function AppHeader({ cloud, session, supabaseEnabled, onMenuToggle }) {
  return (
    <header className="app-header" role="banner">
      <div className="brand"><span className="dot" /> MTG Workshop</div>
      <span className="badge small">
        {cloud ? session.user.email : supabaseEnabled ? "Not signed in" : "Local mode"}
      </span>
      <button
        className="hamburger-btn"
        onClick={onMenuToggle}
        aria-label="Open navigation menu"
      >
        ☰
      </button>
    </header>
  );
}
