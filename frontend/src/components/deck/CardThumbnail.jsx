import { useCallback, useRef, useState } from "react";
import { useCanHover, useCardImage } from "../../lib/hooks";
import CardActionRail from "./CardActionRail";

export default function CardThumbnail({ name, qty, printing, onRemove, onConsider, onSetQty, expanded, onExpand, useArtCrop }) {
  const canHover = useCanHover();
  const data = useCardImage(name, printing);
  // border_crop normalizes the scan borders that vary per printing (see StackView);
  // onError falls back to the plain scan.
  const img = useArtCrop
    ? (data?.art_crop || data?.image || null)
    : (data?.border_crop || data?.image || null);
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
          <img
            src={img}
            alt={`${qty}x ${name}`}
            width="130" height="181" loading="lazy"
            onError={(e) => { if (data?.image && e.currentTarget.src !== data.image) e.currentTarget.src = data.image; }}
          />
        ) : (
          <div className="card-thumb-placeholder">{name}</div>
        )}
        <span className="qty-badge" aria-label={`${qty} copies`}>{qty}</span>
        {/* Desktop control rail; touch keeps the swipe-to-remove gesture instead */}
        {canHover && (
          <CardActionRail name={name} qty={qty} onSetQty={onSetQty} onRemove={onRemove} onConsider={onConsider} />
        )}
      </div>
    </div>
  );
}
