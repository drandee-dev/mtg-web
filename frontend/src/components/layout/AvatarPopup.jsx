import { useRef, useEffect } from "react";

// The account menu: sign in, settings, feedback. Nothing about decks lives
// here; those have their own places in the bar. It is a plain group of
// buttons under a disclosure button, not an ARIA menu: Tab reaches each one,
// and a menu role would promise arrow keys it does not have.
export default function AvatarPopup({ session, triggerRef, onAccountSettings, onSignOut, onFeedback, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onPointer(e) {
      // Ignore clicks on the avatar trigger — its own onClick toggles the popup,
      // so closing here too would immediately reopen it.
      if (e.target.closest?.(".gt-avatar")) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    // Escape hands focus back to the button that opened the menu: the row it
    // was on is about to unmount, and focus would fall to the page.
    function onKey(e) {
      if (e.key !== "Escape") return;
      triggerRef?.current?.focus();
      onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, triggerRef]);

  return (
    <div ref={ref} id="account-menu" className="avatar-popup" role="group" aria-label="Account">
      <div className="avp-section">
        {session && <div className="avp-email" title={session.user.email}>{session.user.email}</div>}
        <button className="avp-row" onClick={() => { onAccountSettings?.(); onClose(); }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
          {/* One panel holds both, and signed out it is the only way to the theme switch. */}
          <span>{session ? "Account settings" : "Sign in or settings"}</span>
        </button>
        {onFeedback && (
          <button className="avp-row" onClick={() => { onFeedback(); onClose(); }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 10a1.5 1.5 0 0 1-1.5 1.5H6l-3.5 3V3.5A1.5 1.5 0 0 1 4 2h8.5A1.5 1.5 0 0 1 14 3.5V10z"/><path d="M5.5 6h5M5.5 8.5h3"/></svg>
            <span>Send feedback</span>
          </button>
        )}
        {session && (
          <button className="avp-row avp-row-danger" onClick={() => { onSignOut?.(); onClose(); }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h3.5A1.5 1.5 0 0 1 15 4.5v7A1.5 1.5 0 0 1 13.5 13H10M7 10l3-2-3-2M1 8h10"/></svg>
            <span>Sign out</span>
          </button>
        )}
      </div>
    </div>
  );
}
