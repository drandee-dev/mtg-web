import { useEffect, useRef } from "react";

export default function HamburgerMenu({ open, onClose, tabs, tab, setTab, session, cloud }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    const previousFocus = document.activeElement;

    first?.focus();
    document.body.style.overflow = "hidden";

    function trap(e) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = "";
      previousFocus?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <nav
        ref={drawerRef}
        className={`drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
      >
        <div className="drawer-header">
          <span className="brand"><span className="dot" /> MTG Workshop</span>
          <button onClick={onClose} aria-label="Close menu" className="ghost">✕</button>
        </div>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`drawer-nav-link ${tab === id ? "active" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => { setTab(id); onClose(); }}
          >
            {label}
          </button>
        ))}
        <div className="drawer-footer">
          <span className="badge small">
            {cloud ? session?.user?.email : "Local mode"}
          </span>
        </div>
      </nav>
    </>
  );
}
