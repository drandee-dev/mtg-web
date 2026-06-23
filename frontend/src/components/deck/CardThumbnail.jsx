import { useCallback, useEffect, useState } from "react";
import { getCardImage } from "../../lib/api";

export default function CardThumbnail({ name, qty, onRemove, onPreview, expanded, onExpand }) {
  const [img, setImg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCardImage(name).then((d) => { if (!cancelled) setImg(d?.image || null); });
    return () => { cancelled = true; };
  }, [name]);

  const handleClick = useCallback(() => {
    if (onExpand) {
      onExpand();
    } else if (onPreview) {
      onPreview(name);
    }
  }, [name, onExpand, onPreview]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <div
      className={`card-thumb ${expanded ? "expanded" : ""}`}
      role="listitem"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${qty}x ${name}`}
    >
      {img ? (
        <img src={img} alt={`${qty}x ${name}`} width="130" height="181" loading="lazy" />
      ) : (
        <div className="card-thumb-placeholder">{name}</div>
      )}
      {qty > 1 && <span className="qty-badge" aria-label={`${qty} copies`}>{qty}</span>}
      {onRemove && (
        <button
          className="remove-btn"
          onClick={(e) => { e.stopPropagation(); onRemove(name); }}
          aria-label={`Remove ${name} from deck`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
