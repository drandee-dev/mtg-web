import { useEffect, useState } from "react";
import { api } from "../../lib/api";
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
  printing = null,
  onSetPrinting = null,
  isCommander = false,
  isConsidering = false,
  onAddToDeck,
  onClose,
  onRemove,
  onConsider,
  onSetQty,
  categories = null,
  currentCategory = null,
  onMove,
  onChangeCommander,
}) {
  const data = useCardImage(name, printing);
  const [showBack, setShowBack] = useState(false);
  const [prints, setPrints] = useState(null); // null=closed, "loading", or array
  useEscapeKey(Boolean(name), onClose);

  // "Ask a rules question" → Rules tab, prefilled with this card. Window event
  // (same pattern as mtgweb:optlog) — the modal opens from too many surfaces
  // to prop-drill a tab switch through each one.
  function askRules() {
    window.dispatchEvent(new CustomEvent("mtgweb:askrules", { detail: { name } }));
    onClose();
  }

  async function togglePrints() {
    if (prints) { setPrints(null); return; }
    setPrints("loading");
    try {
      const r = await api.cardPrints(name);
      setPrints(r.prints || []);
    } catch {
      setPrints([]);
    }
  }

  useEffect(() => {
    if (!name) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [name]);

  // New card → always open on the front face, printings list closed.
  useEffect(() => {
    setShowBack(false); // eslint-disable-line react-hooks/set-state-in-effect
    setPrints(null);
  }, [name]);

  if (!name) return null;

  // Printing/art switcher — shared by the commander and regular-card branches.
  // Pins "Name (SET) 123" (in the decklist for cards, in the commander string
  // for commanders); click the active printing again to reset to default.
  function renderPrintingSwitcher() {
    if (!onSetPrinting) return null;
    return (
      <>
        <div className="cdm-row">
          <span className="cdm-row-label">Printing</span>
          <button className="cdm-print-toggle" onClick={togglePrints} aria-expanded={Boolean(prints)}>
            {printing ? `${printing.set} #${printing.cn}` : "Default"}
            <span aria-hidden="true"> {Array.isArray(prints) ? "▴" : "▾"}</span>
          </button>
        </div>
        {prints === "loading" && <p className="muted small">Loading printings…</p>}
        {Array.isArray(prints) && (
          <div className="cdm-prints" role="listbox" aria-label="Choose a printing">
            {prints.length === 0 && <p className="muted small">No printings found.</p>}
            {prints.map((p) => {
              const active = printing && printing.set === p.set && printing.cn === p.cn;
              return (
                <button
                  key={`${p.set}-${p.cn}`}
                  role="option"
                  aria-selected={Boolean(active)}
                  className={`cdm-print${active ? " on" : ""}`}
                  onClick={() => { onSetPrinting(name, active ? null : { set: p.set, cn: p.cn }); setPrints(null); }}
                  title={`${p.set_name} #${p.cn}${p.price_usd != null ? ` · $${p.price_usd}` : ""}${active ? " — click to reset to default" : ""}`}
                >
                  {p.thumb
                    ? <img src={p.thumb} alt={`${p.set_name} printing`} loading="lazy" />
                    : <span className="cdm-print-noimg">{p.set}</span>}
                  <span className="cdm-print-set">{p.set} #{p.cn}{active ? " ✓" : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  const price = data?.price_usd;
  const hasBack = Boolean(data?.back_image);
  const artSrc = showBack && hasBack ? data.back_image : data?.image;
  const typeLine = showBack && hasBack ? (data?.back_type_line || data?.type_line) : data?.type_line;

  return (
    <div className="cdm-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="cdm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cdm-handle" />
        <button className="cdm-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="cdm-art">
          {artSrc
            ? <img src={artSrc} alt={showBack ? `${name} (back face)` : name} />
            : <div className="cdm-art-placeholder">Loading…</div>}
          {hasBack && (
            <button
              className="cdm-flip"
              onClick={() => setShowBack((b) => !b)}
              aria-label={showBack ? "Show front face" : "Show back face"}
              title={showBack ? "Show front face" : "Show back face"}
            >⟳</button>
          )}
        </div>

        <div className="cdm-body">
          <div className="cdm-head">
            <h3 className="cdm-name">{name}</h3>
            {isCommander && <span className="cdm-cmdr-tag">♛ Commander</span>}
            {isConsidering && <span className="cdm-cmdr-tag cdm-consider-tag">☆ Considering</span>}
          </div>
          {typeLine && <p className="cdm-type muted small">{typeLine}</p>}
          <div className="cdm-meta">
            {data?.mana_cost && <ManaCost cost={data.mana_cost} />}
            {price != null && <span className="badge small">${price.toFixed(2)}</span>}
          </div>

          {isCommander ? (
            <>
              {renderPrintingSwitcher()}
              <div className="cdm-actions">
                {onChangeCommander && (
                  <button className="ghost small" onClick={() => { onChangeCommander(); onClose(); }}>Change commander</button>
                )}
                <button className="ghost small" onClick={askRules}>📖 Rules</button>
                <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
              </div>
            </>
          ) : isConsidering ? (
            <div className="cdm-actions">
              {onAddToDeck && (
                <button className="primary small" onClick={() => { onAddToDeck(name); onClose(); }}>+ Add to deck</button>
              )}
              <button className="ghost small" onClick={askRules}>📖 Rules</button>
              <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
              {onRemove && (
                <button className="ghost small btn-danger" onClick={() => { onRemove(name); onClose(); }}>Remove</button>
              )}
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

              {renderPrintingSwitcher()}

              <div className="cdm-actions">
                {onConsider && (
                  <button className="ghost small" onClick={() => { onConsider(name); onClose(); }}>Considering</button>
                )}
                <button className="ghost small" onClick={askRules}>📖 Rules</button>
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
