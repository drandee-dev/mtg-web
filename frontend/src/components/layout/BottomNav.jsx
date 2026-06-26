const ICONS = {
  decks: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  deck: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  rules: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M8 3.5v10M8 3.5C8 3.5 6.5 2 3 2v10c3.5 0 5 1.5 5 1.5M8 3.5C8 3.5 9.5 2 13 2v10c-3.5 0-5 1.5-5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  cards: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const LABELS = {
  decks: "Decks",
  deck: "Build",
  rules: "Rules",
  cards: "Cards",
};

export default function BottomNav({ tabs, tab, setTab }) {
  return (
    <nav className="bottom-nav" role="tablist" aria-label="Main navigation">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          className={`bn-tab${tab === id ? " active" : ""}`}
          onClick={() => setTab(id)}
        >
          <span className="bn-icon">{ICONS[id]}</span>
          <span className="bn-label">{LABELS[id] || label}</span>
        </button>
      ))}
    </nav>
  );
}
