import { useEffect, useRef, useState } from "react";
import { getCardImage } from "../../lib/api";

export default function CardBottomSheet({ name, onClose, onRemove, onAddToConsidering }) {
  const [data, setData] = useState(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    getCardImage(name).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [name]);

  useEffect(() => {
    if (!name) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [name, onClose]);

  if (!name) return null;

  return (
    <>
      <div className="bs-overlay" onClick={onClose} />
      <div className="bs-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={name}>
        <div className="bs-handle" />
        <div className="bs-content">
          {data?.image ? (
            <img className="bs-card-img" src={data.image} alt={name} />
          ) : (
            <div className="bs-card-placeholder">Loading…</div>
          )}
          <div className="bs-info">
            <h3 className="bs-name">{name}</h3>
            {data?.type_line && <p className="bs-type muted small">{data.type_line}</p>}
            {data?.oracle_text && <p className="bs-oracle small">{data.oracle_text}</p>}
            {data?.price_usd != null && (
              <span className="badge small">${data.price_usd.toFixed(2)}</span>
            )}
          </div>
          <div className="bs-actions">
            {onRemove && (
              <button className="ghost small btn-danger" onClick={() => { onRemove(name); onClose(); }}>
                Remove
              </button>
            )}
            {onAddToConsidering && (
              <button className="ghost small" onClick={() => { onAddToConsidering(name); onClose(); }}>
                → Considering
              </button>
            )}
            <button className="ghost small" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </>
  );
}
