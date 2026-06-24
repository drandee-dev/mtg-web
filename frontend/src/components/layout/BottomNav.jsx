const ICONS = {
  decks: "⬡",
  deck: "🂠",
  rules: "📖",
  cards: "🔍",
  settings: "⚙",
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
          <span className="bn-icon">{ICONS[id] || "•"}</span>
          <span className="bn-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
