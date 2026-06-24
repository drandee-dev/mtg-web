import { useCallback, useEffect, useRef, useState } from "react";
import { getCardImage } from "../../lib/api";

const canHover =
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

export default function CardThumbnail({ name, qty, onRemove, onPreview, expanded, onExpand }) {
  const [img, setImg] = useState(null);
  const [swipeX, setSwipeX] = useState(0);
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });

  useEffect(() => {
    let cancelled = false;
    getCardImage(name).then((d) => { if (!cancelled) setImg(d?.image || null); });
    return () => { cancelled = true; };
  }, [name]);

  const handleClick = useCallback(() => {
    if (swipeX !== 0) return;
    if (onExpand) {
      onExpand();
    } else if (onPreview) {
      onPreview(name);
    }
  }, [name, onExpand, onPreview, swipeX]);

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
    </div>
  );
}
