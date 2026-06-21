import { useState } from "react";

const FORMSPREE_ID = import.meta.env.VITE_FORMSPREE_ID;

export default function Feedback({ notify }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!FORMSPREE_ID) return null;

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
        setOpen(false);
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
    <>
      <button className="feedback-btn" onClick={() => setOpen(!open)} aria-label="Send feedback">
        ?
      </button>

      {open && (
        <div className="feedback-modal" onClick={() => setOpen(false)}>
          <div className="feedback-panel" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
