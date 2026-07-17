import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/hooks";

const FORMSPREE_ID = import.meta.env.VITE_FORMSPREE_ID;

// Controlled feedback modal — opened from the avatar menu (the old floating "?"
// button is gone; it collided with the FABs and covered open sheets on mobile).
// Callers gate their trigger on VITE_FORMSPREE_ID being set.
export default function Feedback({ open, onClose, notify }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);
  const trapRef = useFocusTrap(Boolean(FORMSPREE_ID && open));

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (el) el.querySelector("textarea")?.focus();
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!FORMSPREE_ID || !open) return null;

  async function submit() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          page: window.location.hash || window.location.pathname,
          _subject: "MTG Workshop feedback",
        }),
      });
      if (res.ok) {
        notify("Thanks for the feedback!");
        setMessage("");
        onClose();
      } else {
        notify("Feedback failed — try again.");
      }
    } catch {
      notify("Couldn't send feedback — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feedback-modal" onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Send feedback" ref={trapRef} tabIndex={-1}>
      <div className="feedback-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <h3>Send feedback</h3>
        <p className="muted small">Bug reports, feature requests, or general thoughts — all welcome.</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          style={{ width: "100%" }}
        />
        <div className="row" style={{ marginTop: ".5rem" }}>
          <button className="primary" onClick={submit} disabled={busy || !message.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
