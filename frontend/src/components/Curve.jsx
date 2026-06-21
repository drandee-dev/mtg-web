// Simple mana-curve bar chart from the analyze response's stats.curve ({cmc: count}).
export default function Curve({ curve }) {
  const entries = Object.entries(curve || {}).map(([k, v]) => [Number(k), v]);
  if (!entries.length) return <p className="muted small">No nonland cards to chart.</p>;
  const max = Math.max(...entries.map(([, v]) => v));
  // Show buckets 0..7+, folding everything >=7 into the last column.
  const buckets = {};
  for (const [cmc, v] of entries) {
    const key = cmc >= 7 ? 7 : cmc;
    buckets[key] = (buckets[key] || 0) + v;
  }
  const cols = [0, 1, 2, 3, 4, 5, 6, 7];
  const MAX_PX = 90; // pixel height of the tallest bar (robust vs % in flex parents)
  return (
    <div className="curve" role="img" aria-label="Mana curve">
      {cols.map((c) => {
        const v = buckets[c] || 0;
        const h = max && v ? Math.max(3, Math.round((v / max) * MAX_PX)) : 0;
        return (
          <div className="bar" key={c}>
            <div className="cnt">{v || ""}</div>
            <div className="fill" style={{ height: `${h}px` }} />
            <div className="lbl">{c === 7 ? "7+" : c}</div>
          </div>
        );
      })}
    </div>
  );
}
