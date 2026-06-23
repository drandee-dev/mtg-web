export default function NavBar({ tabs, tab, setTab }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Main navigation">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          className={tab === id ? "active" : ""}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
