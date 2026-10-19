import { useEffect, useRef, useState } from "react";

// A compact "⋯" dropdown menu. Each item is { label, onClick, danger?, icon? }.
// Keyboard: Enter or Space opens it with the first item focused, the arrows move between
// items, Escape closes it and puts focus back on the button. (A mouse click leaves focus alone.)
export default function MoreMenu({ items, label = "More actions" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && focusFirst.current) listRef.current?.querySelector("[role=menuitem]")?.focus();
    focusFirst.current = false;
  }, [open]);

  function onItemKey(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...listRef.current.querySelectorAll("[role=menuitem]")];
    const i = all.indexOf(document.activeElement);
    all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
  }

  return (
    <div className="more-menu" ref={ref}>
      <button
        ref={btnRef}
        className="more-menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // detail is 0 for a keyboard-triggered click.
          if (!open && e.detail === 0) focusFirst.current = true;
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open && (
        <div className="more-menu-list" role="menu" ref={listRef} onKeyDown={onItemKey}>
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`more-menu-item ${item.danger ? "danger" : ""}`}
              onClick={() => { setOpen(false); item.onClick(); }}
            >
              {item.icon && <span className="more-menu-icon" aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
