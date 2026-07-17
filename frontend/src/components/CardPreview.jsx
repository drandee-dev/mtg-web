import { useCallback, useEffect, useRef, useState } from "react";
import { getCardImage } from "../lib/api";
import { useCanHover, useEscapeKey, useFocusTrap } from "../lib/hooks";

export default function CardPreview({ name, children }) {
  const canHover = useCanHover();
  const [data, setData] = useState(null);
  const [hover, setHover] = useState(false);
  const [modal, setModal] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const elRef = useRef(null);
  const nameRef = useRef(name);

  useEffect(() => {
    if (name !== nameRef.current) {
      setData(null);
      nameRef.current = name;
    }
  }, [name]);

  useEscapeKey(modal, () => setModal(false));
  const modalRef = useFocusTrap(modal);

  const ensure = useCallback(async () => {
    if (data && nameRef.current === name) return data;
    const d = await getCardImage(name);
    setData(d);
    return d;
  }, [data, name]);

  function onEnter(e) {
    if (!canHover) return;
    ensure();
    const r = (elRef.current || e.currentTarget).getBoundingClientRect();
    // Scale the float with the viewport so oracle text is readable: ~60% of
    // the viewport height, clamped so small laptops still fit and huge
    // monitors don't upscale past the source image. MTG card aspect is 63:88.
    const gap = 10;
    const H = Math.round(Math.min(window.innerHeight * 0.6, 540));
    const W = Math.round((H * 63) / 88);
    let left = r.right + gap;
    if (left + W > window.innerWidth) left = Math.max(gap, r.left - W - gap);
    let top = r.top;
    if (top + H > window.innerHeight) top = Math.max(gap, window.innerHeight - H - gap);
    setPos({ left, top, w: W, h: H });
    setHover(true);
  }

  function openModal() {
    ensure();
    setModal(true);
  }

  const img = data?.image;
  return (
    <>
      <span
        ref={elRef}
        className="cardname"
        role="button"
        tabIndex={0}
        onMouseEnter={onEnter}
        onMouseLeave={() => setHover(false)}
        onClick={openModal}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); } }}
      >
        {children || name}
      </span>

      {hover && (
        <span className="card-float" style={{ left: pos.left, top: pos.top }}>
          {img
            ? <img src={img} alt={name} style={{ width: pos.w, height: pos.h }} loading="lazy" />
            : <span className="card-float-empty">{data ? "No image" : "Loading…"}</span>}
        </span>
      )}

      {modal && (
        <div className="card-modal" onClick={() => setModal(false)} role="dialog" aria-modal="true" aria-label={name} ref={modalRef} tabIndex={-1}>
          {img
            ? <img
                // Scryfall CDN paths are predictable — swap in the `large`
                // scan (672×936) so the scaled-up modal stays crisp; fall
                // back to the stored `normal` URL if large is missing.
                src={img.replace(/\/(normal|small)\//, "/large/")}
                onError={(e) => { if (e.currentTarget.src !== img) e.currentTarget.src = img; }}
                alt={name}
                loading="lazy"
              />
            : <div className="card-modal-empty">{data ? `No image for ${name}` : "Loading…"}</div>}
        </div>
      )}
    </>
  );
}
