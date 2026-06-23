import { useMemo, useState } from "react";

// log-factorial via lgamma-ish sum (stable for our small N ≤ ~100)
function logFact(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}
// P(exactly x successes) drawing `draws` from deck N with K successes
function hyperExact(N, K, draws, x) {
  const ln = logChoose(K, x) + logChoose(N - K, draws - x) - logChoose(N, draws);
  return Number.isFinite(ln) ? Math.exp(ln) : 0;
}
// P(at least `atLeast` successes)
function hyperAtLeast(N, K, draws, atLeast) {
  let p = 0;
  const maxX = Math.min(K, draws);
  for (let x = atLeast; x <= maxX; x++) p += hyperExact(N, K, draws, x);
  return Math.max(0, Math.min(1, p));
}

export default function DrawProbability({ result, commander, format }) {
  const isCmdr = format === "commander" || format === "paupercommander";
  const landCount = result?.stats?.land_count ?? 0;
  const totalCards = result?.total_cards ?? (isCmdr ? 100 : 60);
  // Library = deck minus commander(s) in the command zone
  const cmdrCount = isCmdr && commander ? commander.split(" && ").filter(Boolean).length : 0;
  const defaultN = Math.max(1, totalCards - cmdrCount);

  const [deckSize, setDeckSize] = useState(defaultN);
  const [copies, setCopies] = useState(landCount || 38);
  const [onPlay, setOnPlay] = useState(true);
  const [turn, setTurn] = useState(1);
  const [atLeast, setAtLeast] = useState(1);

  const draws = useMemo(() => {
    // opening hand 7, +1 per turn; on the draw adds the turn-1 draw step
    const extra = onPlay ? turn - 1 : turn;
    return Math.min(deckSize, 7 + Math.max(0, extra));
  }, [onPlay, turn, deckSize]);

  const prob = useMemo(
    () => hyperAtLeast(deckSize, copies, draws, atLeast),
    [deckSize, copies, draws, atLeast]
  );

  return (
    <div className="panel">
      <h3>Draw Probability</h3>
      <p className="muted small">
        Hypergeometric odds of drawing your target cards by a given turn.
      </p>
      <div className="draw-odds-grid">
        <label>Library size
          <input type="number" min="1" value={deckSize}
            onChange={(e) => setDeckSize(Math.max(1, +e.target.value || 1))} />
        </label>
        <label>Copies in deck
          <input type="number" min="0" value={copies}
            onChange={(e) => setCopies(Math.max(0, +e.target.value || 0))} />
        </label>
        <label>By turn
          <input type="number" min="0" value={turn}
            onChange={(e) => setTurn(Math.max(0, +e.target.value || 0))} />
        </label>
        <label>At least
          <input type="number" min="1" value={atLeast}
            onChange={(e) => setAtLeast(Math.max(1, +e.target.value || 1))} />
        </label>
      </div>
      <div className="row" style={{ gap: ".5rem", marginTop: ".5rem", alignItems: "center" }}>
        <div className="view-toggle" role="group" aria-label="Play or draw">
          <button className={`view-toggle-btn ${onPlay ? "active" : ""}`} aria-pressed={onPlay} onClick={() => setOnPlay(true)}>On the play</button>
          <button className={`view-toggle-btn ${!onPlay ? "active" : ""}`} aria-pressed={!onPlay} onClick={() => setOnPlay(false)}>On the draw</button>
        </div>
        <span className="muted small">{draws} cards seen</span>
        {landCount > 0 && (
          <button className="ghost small" onClick={() => setCopies(landCount)}>Use land count ({landCount})</button>
        )}
      </div>
      <div className="draw-odds-result">
        <span className="draw-odds-pct">{(prob * 100).toFixed(1)}%</span>
        <span className="muted small">
          chance of ≥ {atLeast} in your first {draws} cards
        </span>
      </div>
    </div>
  );
}
