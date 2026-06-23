import { useEffect, useState, useCallback } from "react";
import { getCardImage } from "../../lib/api";
import { parseDeckText, groupByMtgType } from "../../lib/deckParser";
import CardThumbnail from "./CardThumbnail";
import CardListRow from "./CardListRow";
import ViewToggle from "./ViewToggle";
import CardPreview from "../CardPreview";

const canHover =
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

export default function CardGrid({ decklist, commander, onRemove, notify }) {
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("mtgweb:viewMode") || "grid"
  );
  const [typeMap, setTypeMap] = useState({});
  const [priceMap, setPriceMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);

  const { cards, totalCards } = parseDeckText(decklist);

  useEffect(() => {
    localStorage.setItem("mtgweb:viewMode", viewMode);
  }, [viewMode]);

  // Resolve type_line and prices for all cards
  useEffect(() => {
    const names = [...new Set(cards.map((c) => c.name))];
    let cancelled = false;
    Promise.all(
      names.map(async (name) => {
        const d = await getCardImage(name);
        return [name, d];
      })
    ).then((entries) => {
      if (cancelled) return;
      const types = {};
      const prices = {};
      for (const [name, d] of entries) {
        types[name] = d?.type_line || "";
        prices[name] = d?.price_usd ?? null;
      }
      setTypeMap(types);
      setPriceMap(prices);
    });
    return () => { cancelled = true; };
  }, [decklist]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = Object.keys(typeMap).length > 0
    ? groupByMtgType(cards, typeMap)
    : cards.length > 0
      ? { "All Cards": cards }
      : {};

  const handlePreview = useCallback((name) => setPreviewCard(name), []);
  const closePreview = useCallback(() => setPreviewCard(null), []);

  // Touch: first tap expands, second tap opens preview
  const handleThumbnailExpand = useCallback((cardName) => {
    if (canHover) {
      setPreviewCard(cardName);
    } else {
      if (expandedId === cardName) {
        setPreviewCard(cardName);
        setExpandedId(null);
      } else {
        setExpandedId(cardName);
      }
    }
  }, [expandedId]);

  const groupTotal = (cards) => cards.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="card-grid-container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", margin: ".4rem 0" }}>
        <span className="muted small">{totalCards} cards</span>
        <ViewToggle mode={viewMode} setMode={setViewMode} />
      </div>

      {Object.entries(groups).map(([type, groupCards]) => (
        <div key={type} className="card-group">
          <div className="group-header">
            <h3>{type}</h3>
            <span className="count">({groupTotal(groupCards)})</span>
          </div>

          {viewMode === "grid" && (
            <div className="card-grid" role="list">
              {groupCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  onRemove={onRemove}
                  onExpand={() => handleThumbnailExpand(c.name)}
                />
              ))}
            </div>
          )}

          {viewMode === "stack" && (
            <div className="card-stack" role="list">
              {groupCards.map((c) => (
                <CardThumbnail
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  onRemove={onRemove}
                  expanded={expandedId === c.name}
                  onExpand={() => handleThumbnailExpand(c.name)}
                />
              ))}
            </div>
          )}

          {viewMode === "list" && (
            <div className="card-list" role="list">
              {groupCards.map((c) => (
                <CardListRow
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  typeLine={typeMap[c.name]}
                  price={priceMap[c.name]}
                  onRemove={onRemove}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {totalCards === 0 && (
        <p className="muted" style={{ textAlign: "center", padding: "2rem 0" }}>
          No cards yet — use the search bar above to add cards, or paste a decklist.
        </p>
      )}

      {/* Full-size card preview modal */}
      {previewCard && (
        <div className="card-modal" onClick={closePreview} role="dialog" aria-modal="true" aria-label={previewCard}>
          <CardPreviewModal name={previewCard} />
        </div>
      )}
    </div>
  );
}

function CardPreviewModal({ name }) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    getCardImage(name).then((d) => setImg(d?.image || null));
  }, [name]);
  if (!img) return <div className="card-modal-empty">Loading…</div>;
  return <img src={img} alt={name} width="488" height="680" loading="lazy" />;
}
