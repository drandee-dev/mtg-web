import { useCallback, useRef, useState } from "react";
import { canHover, useCardImage } from "../../lib/hooks";

export default function CardThumbnail({ name, qty, onRemove, onConsider, expanded, onExpand, useArtCrop }) {
  const data = useCardImage(name);
  const img = useArtCrop ? (data?.art_crop || data?.image || null) : (data?.image || null);
  const [swipeX, setSwipeX] = useState(0);
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });

  const handleClick = useCallback(() => {
    if (swipeX !== 0) return;
    onExpand?.();
  }, [onExpand, swipeX]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  function onTouchStart(e) {
    if (canHover || !onRemove) return;
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, swiping: false };
  }

  function onTouchMove(e) {
    if (canHover || !onRemove) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (!touchRef.current.swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.swiping = true;
    }
    if (touchRef.current.swiping) {
      setSwipeX(Math.min(0, Math.max(-80, dx)));
    }
  }

  function onTouchEnd() {
    if (!touchRef.current.swiping) { setSwipeX(0); return; }
    if (swipeX < -40) {
      setSwipeX(-80);
    } else {
      setSwipeX(0);
    }
  }

  function confirmRemove(e) {
    e.stopPropagation();
    setSwipeX(0);
    onRemove?.(name);
  }

  return (
    <div className="card-thumb-swipe-wrap">
      {/* Remove action behind the card */}
      {swipeX < 0 && onRemove && (
        <button className="swipe-remove-action" onClick={confirmRemove} aria-label={`Remove ${name}`}>
          Remove
        </button>
      )}
      <div
        className={`card-thumb ${expanded ? "expanded" : ""}`}
        role="listitem"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-label={`${qty}x ${name}`}
        style={swipeX !== 0 ? { transform: `translateX(${swipeX}px)`, transition: "none" } : undefined}
      >
        {img ? (
          <img src={img} alt={`${qty}x ${name}`} width="130" height="181" loading="lazy" />
        ) : (
          <div className="card-thumb-placeholder">{name}</div>
        )}
        <span className="qty-badge" aria-label={`${qty} copies`}>{qty}</span>
        {/* Desktop corner remove ✕ — touch keeps the swipe-to-remove gesture instead */}
        {canHover && onRemove && (
          <button className="card-corner-remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }}
            aria-label={`Remove ${name} from deck`}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4L4 12"/></svg>
          </button>
        )}
        {/* Desktop hover overlay — Consider / Scryfall */}
        {canHover && (
          <div className="card-hover-overlay">
            {onConsider && (
              <button
                className="card-hover-btn card-hover-consider"
                onClick={(e) => { e.stopPropagation(); onConsider(name); }}
                aria-label={`Move ${name} to considering`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
                <span>Consider</span>
              </button>
            )}
            <button
              className="card-hover-btn card-hover-scryfall"
              onClick={(e) => { e.stopPropagation(); window.open(`https://scryfall.com/search?q=${encodeURIComponent(name)}`, "_blank", "noopener"); }}
              aria-label={`Open ${name} on Scryfall`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V9"/><path d="M9.5 2H14v4.5"/><line x1="14" y1="2" x2="7.5" y2="8.5"/></svg>
              <span>Scryfall</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
