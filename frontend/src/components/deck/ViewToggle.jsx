// Stacks / Grid / List, in words as on the Pick-Deck mockup (job 3.3).
const MODES = [
  { id: "stack", label: "Stacks" },
  { id: "grid", label: "Grid" },
  { id: "list", label: "List" },
];

export default function ViewToggle({ mode, setMode }) {
  return (
    <div className="view-toggle" role="group" aria-label="Card display mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`view-toggle-btn ${mode === m.id ? "active" : ""}`}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
