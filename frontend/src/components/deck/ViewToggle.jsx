const MODES = [
  { id: "grid", icon: "▦", label: "Grid view" },
  { id: "stack", icon: "≡", label: "Stacked view" },
  { id: "list", icon: "☰", label: "List view" },
];

export default function ViewToggle({ mode, setMode }) {
  return (
    <div className="view-toggle" role="group" aria-label="Card display mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`view-toggle-btn ${mode === m.id ? "active" : ""}`}
          aria-pressed={mode === m.id}
          aria-label={m.label}
          onClick={() => setMode(m.id)}
        >
          {m.icon}
        </button>
      ))}
    </div>
  );
}
