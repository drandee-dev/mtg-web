import { useEffect } from "react";
import { useCardImage, useEscapeKey } from "../../lib/hooks";
import ManaCost from "./ManaCost";

// Scryfall exact-name search redirects to the card's page (which has a Rulings tab).
const scryfallUrl = (name) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;

// Archidekt-style card detail modal — centered panel on desktop, bottom sheet on
// mobile (responsive via CSS). This is the "modal shell" pass: everything that needs
// no backend/data-model change. The printing/art switcher comes in a later pass.
export default function CardDetailModal({
  name,
  qty = 1,
  isCommander = false,
  onClose,
  onRemove,
  onConsider,
  onSetQty,
  categories = null,
  currentCategory = null,
  onMove,
  onChangeCommander,
}) {
  const data = useCardImage(name);
  useEscapeKey(Boolean(name), onClose);

  useEffect(() => {
    if (!name) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [name]);

  if (!name) return null;

  const price = data?.price_usd;

  return (
    <div className="cdm-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="cdm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cdm-handle" />
        <button className="cdm-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="cdm-art">
          {data?.image
            ? <img src={data.image} alt={name} />
            : <div className="cdm-art-placeholder">Loading…</div>}
        </div>

        <div className="cdm-body">
          <div className="cdm-head">
            <h3 className="cdm-name">{name}</h3>
            {isCommander && <span className="cdm-cmdr-tag">♛ Commander</span>}
          </div>
          {data?.type_line && <p className="cdm-type muted small">{data.type_line}</p>}
          <div className="cdm-meta">
            {data?.mana_cost && <ManaCost cost={data.mana_cost} />}
            {price != null && <span className="badge small">${price.toFixed(2)}</span>}
          </div>

          {isCommander ? (
            <div className="cdm-actions">
              {onChangeCommander && (
                <button className="ghost small" onClick={() => { onChangeCommander(); onClose(); }}>Change commander</button>
              )}
              <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
            </div>
          ) : (
            <>
              {onSetQty && (
                <div className="cdm-row">
                  <span className="cdm-row-label">Quantity</span>
                  <div className="cdm-stepper">
                    <button onClick={() => onSetQty(name, Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease quantity">−</button>
                    <span className="cdm-qty-val">{qty}</span>
                    <button onClick={() => onSetQty(name, qty + 1)} aria-label="Increase quantity">+</button>
                  </div>
                </div>
              )}

              {categories && categories.length > 0 && onMove && (
                <div className="cdm-row">
                  <span className="cdm-row-label">Category</span>
                  <select
                    className="cdm-cat-select"
                    value={currentCategory || ""}
                    onChange={(e) => { onMove(name, e.target.value); }}
                    aria-label="Move card to category"
                  >
                    {!currentCategory && <option value="" disabled>Move to…</option>}
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="cdm-actions">
                {onConsider && (
                  <button className="ghost small" onClick={() => { onConsider(name); onClose(); }}>Considering</button>
                )}
                <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
                {onRemove && (
                  <button className="ghost small btn-danger" onClick={() => { onRemove(name); onClose(); }}>Remove</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
