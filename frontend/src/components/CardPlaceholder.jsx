// A deck address while its deck loads: the header (80px), the strip (56px) and
// one stack column, at their real sizes. The words stay for screen readers and
// for the specs that read them.
export function DeckPlaceholder() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden" role="status">Loading deck…</span>
      <div aria-hidden="true">
        <div className="ph ph-deck-head" />
        <div className="ph ph-deck-strip" />
        <div className="ph-deck-col">
          <span className="ph ph-deck-label" />
          <CardPlaceholder /><CardPlaceholder /><CardPlaceholder />
        </div>
      </div>
    </div>
  );
}

// A panel that is waiting on something small: three lines.
export function PanelPlaceholder({ label = "Loading…" }) {
  return (
    <div className="panel" aria-busy="true">
      <span className="visually-hidden" role="status">{label}</span>
      <div aria-hidden="true">
        <span className="ph ph-line ph-w-60" />
        <span className="ph ph-line ph-w-90" />
        <span className="ph ph-line ph-w-30" />
      </div>
    </div>
  );
}

// A card-shaped frame with the card's name, shown until its art arrives. While
// `loading` it breathes; with no image to come (`loading` false) it sits still.
// The name is also on the control that holds it, so screen readers skip it here.
export default function CardPlaceholder({ name, loading = true, className = "", style }) {
  return (
    <div className={`ph-card${loading ? " ph-busy" : ""}${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">
      {name && <span className="ph-card-name">{name}</span>}
    </div>
  );
}
