import React from "react";

const TYPE_ORDER = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Land",
];

function groupByType(cards) {
  const groups = {};
  for (const card of cards) {
    const tl = (card.type_line || "").toLowerCase();
    const cat =
      TYPE_ORDER.find((t) => tl.includes(t.toLowerCase())) || "Other";
    (groups[cat] ??= []).push(card);
  }
  return TYPE_ORDER.filter((t) => groups[t])
    .map((t) => [t, groups[t]])
    .concat(groups["Other"] ? [["Other", groups["Other"]]] : []);
}

export default function StackView({ cards = [], groupBy = "type", onCardClick }) {
  const groups = groupByType(cards);

  return (
    <div className="stack-view">
      {groups.map(([label, groupCards]) => (
        <div key={label} className="stack-column">
          <div className="stack-column-header">
            <span className="stack-column-label">{label}</span>
            <span className="stack-column-count">({groupCards.length})</span>
          </div>
          <div className="stack-cards">
            {groupCards.map((card, i) => (
              <div
                key={card.name + i}
                className="stack-card-wrap"
                onClick={() => onCardClick?.(card)}
              >
                {card.image ? (
                  <img src={card.image} alt={card.name} loading="lazy" />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "var(--panel-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: ".5rem",
                      color: "var(--muted)",
                      textAlign: "center",
                      padding: ".2rem",
                    }}
                  >
                    {card.name}
                  </div>
                )}
                {card.qty > 1 && (
                  <span className="stack-card-qty">{card.qty}</span>
                )}
                <div className="stack-card-name">
                  <span>{card.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
