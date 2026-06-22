import { useCallback, useEffect, useState } from "react";
import CardPreview from "./CardPreview";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseCards(text) {
  return (text || "").split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\s+\S/.test(l))
    .flatMap((l) => {
      const m = l.match(/^(\d+)\s+(.+)$/);
      if (!m) return [];
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      return Array.from({ length: qty }, (_, i) => ({ id: `${name}-${i}-${Math.random()}`, name }));
    });
}

export default function Playtest({ decklist, commander, onClose }) {
  const [library, setLibrary] = useState([]);
  const [hand, setHand] = useState([]);
  const [battlefield, setBattlefield] = useState([]);
  const [graveyard, setGraveyard] = useState([]);
  const [exile, setExile] = useState([]);
  const [turn, setTurn] = useState(0);
  const [life, setLife] = useState(40);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [phase, setPhase] = useState("mulligan"); // mulligan | playing

  const reset = useCallback(() => {
    const cards = parseCards(decklist);
    const shuffled = shuffle(cards);
    setLibrary(shuffled.slice(7));
    setHand(shuffled.slice(0, 7));
    setBattlefield([]);
    setGraveyard([]);
    setExile([]);
    setTurn(0);
    setLife(40);
    setMulliganCount(0);
    setPhase("mulligan");
  }, [decklist]);

  useEffect(() => { reset(); }, [reset]);

  function mulligan() {
    const cards = parseCards(decklist);
    const shuffled = shuffle(cards);
    const newMull = mulliganCount + 1;
    const drawCount = Math.max(7 - newMull, 1);
    setLibrary(shuffled.slice(drawCount));
    setHand(shuffled.slice(0, drawCount));
    setMulliganCount(newMull);
  }

  function keepHand() {
    setPhase("playing");
    setTurn(1);
  }

  function drawCard() {
    if (library.length === 0) return;
    setHand((h) => [...h, library[0]]);
    setLibrary((l) => l.slice(1));
  }

  function nextTurn() {
    setTurn((t) => t + 1);
    drawCard();
  }

  function moveCard(card, from, to) {
    const setters = { hand: setHand, battlefield: setBattlefield, graveyard: setGraveyard, exile: setExile, library: setLibrary };
    setters[from]((prev) => prev.filter((c) => c.id !== card.id));
    setters[to]((prev) => [...prev, card]);
  }

  const zones = [
    { key: "hand", label: "Hand", cards: hand, actions: [["Play", "battlefield"], ["Discard", "graveyard"]] },
    { key: "battlefield", label: "Battlefield", cards: battlefield, actions: [["Destroy", "graveyard"], ["Exile", "exile"], ["Bounce", "hand"]] },
    { key: "graveyard", label: "Graveyard", cards: graveyard, actions: [["Return", "hand"]] },
    { key: "exile", label: "Exile", cards: exile, actions: [] },
  ];

  return (
    <div className="panel">
      <div className="spread">
        <h2>Playtest{commander ? `: ${commander.replace(" && ", " + ")}` : ""}</h2>
        <div className="row" style={{ gap: ".3rem" }}>
          <button className="ghost small" onClick={reset}>New game</button>
          <button className="ghost small" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="row" style={{ gap: "1rem", margin: ".5rem 0", flexWrap: "wrap" }}>
        <span>Turn: <strong>{turn}</strong></span>
        <span>Life: <strong>{life}</strong>
          <button className="ghost small" onClick={() => setLife((l) => l - 1)} style={{ padding: "0 .3rem", marginLeft: ".2rem" }}>-</button>
          <button className="ghost small" onClick={() => setLife((l) => l + 1)} style={{ padding: "0 .3rem" }}>+</button>
        </span>
        <span>Library: <strong>{library.length}</strong></span>
        <span className="muted small">Hand: {hand.length} | Battlefield: {battlefield.length} | Graveyard: {graveyard.length}</span>
      </div>

      {/* Mulligan phase */}
      {phase === "mulligan" && (
        <div style={{ margin: ".5rem 0" }}>
          <p className="muted small">
            {mulliganCount === 0 ? "Opening hand — keep or mulligan?" : `Mulligan ${mulliganCount} — drawing ${Math.max(7 - mulliganCount, 1)} cards.`}
          </p>
          <div className="row" style={{ gap: ".3rem" }}>
            <button className="primary" onClick={keepHand}>Keep</button>
            {7 - mulliganCount > 1 && <button onClick={mulligan}>Mulligan</button>}
          </div>
        </div>
      )}

      {/* Playing phase controls */}
      {phase === "playing" && (
        <div style={{ margin: ".5rem 0" }}>
          <div className="row" style={{ gap: ".3rem" }}>
            <button className="primary" onClick={nextTurn}>Next turn (draw)</button>
            <button className="ghost small" onClick={drawCard}>Draw (no turn)</button>
          </div>
        </div>
      )}

      {/* Card zones */}
      {zones.map((zone) => (
        <div key={zone.key} style={{ marginTop: ".8rem" }}>
          <h3 style={{ fontSize: ".9rem" }}>{zone.label} ({zone.cards.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
            {zone.cards.length === 0 && <span className="muted small">Empty</span>}
            {zone.cards.map((card) => (
              <div key={card.id} className="playtest-card">
                <CardPreview name={card.name} />
                {zone.actions.length > 0 && (
                  <div className="playtest-actions">
                    {zone.actions.map(([label, target]) => (
                      <button key={target} className="ghost small" onClick={() => moveCard(card, zone.key, target)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
