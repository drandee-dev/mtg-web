import { useCallback, useEffect, useRef, useState } from "react";
import { getCardImage } from "../lib/api";
import { useCanHover, useEscapeKey } from "../lib/hooks";

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
    const W = 232, H = 324, gap = 10;
    let left = r.right + gap;
    if (left + W > window.innerWidth) left = Math.max(gap, r.left - W - gap);
    let top = r.top;
    if (top + H > window.innerHeight) top = Math.max(gap, window.innerHeight - H - gap);
    setPos({ left, top });
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
            ? <img src={img} alt={name} width="232" height="324" loading="lazy" />
            : <span className="card-float-empty">{data ? "No image" : "Loading…"}</span>}
        </span>
      )}

      {modal && (
        <div className="card-modal" onClick={() => setModal(false)} role="dialog" aria-modal="true" aria-label={name}>
          {img
            ? <img src={img} alt={name} width="488" height="680" loading="lazy" />
            : <div className="card-modal-empty">{data ? `No image for ${name}` : "Loading…"}</div>}
        </div>
      )}
    </>
  );
}
