import { useRef, useEffect, useState } from "react";
import { disassembleDecklist, getCardImage } from "../../lib/api";

export default function AvatarPopup({
  decks, session, onNewDeck, onImportUrl, onSearchDecks, onOpenDeck, onPasteDecklist,
  setTab, onAccountSettings, onSignOut, onClose,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      // Ignore clicks on the avatar trigger — its own onClick toggles the popup,
      // so closing here too would immediately reopen it.
      if (e.target.closest?.(".gt-avatar")) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  const recentDecks = (decks || [])
    .slice()
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, 6);

  return (
    <div ref={ref} className="avatar-popup">
      {/* Section 1: Actions */}
      <div className="avp-section">
        <button className="avp-row avp-row-highlight" onClick={() => { onNewDeck?.(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
          <span>New Deck</span>
        </button>
        <button className="avp-row" onClick={() => { onImportUrl?.(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
          <span>Import URL</span>
          <span className="avp-badge-new">New</span>
        </button>
        <button className="avp-row" onClick={() => { onPasteDecklist?.(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 5h10M3 8h10M3 11h6"/></svg>
          <span>Paste Decklist</span>
        </button>
      </div>

      <div className="avp-divider" />

      {/* Section 2: Navigation */}
      <div className="avp-section">
        <button className="avp-search-shell" onClick={() => { onSearchDecks?.(); onClose(); }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
          <span className="avp-search-placeholder">Search my decks…</span>
        </button>
      </div>

      {recentDecks.length > 0 && (
        <>
          <div className="avp-divider" />
          {/* Section 3: Recent decks */}
          <div className="avp-section">
            <div className="avp-section-label">Recent</div>
            <div className="avp-recents-scroll">
              {recentDecks.map((deck) => (
                <RecentDeckRow key={deck.id} deck={deck} onOpenDeck={onOpenDeck} onClose={onClose} />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="avp-divider" />

      {/* Section 4: Account */}
      <div className="avp-section">
        <button className="avp-row" onClick={() => { onAccountSettings?.(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
          <span>Account Settings</span>
        </button>
        {session && (
          <button className="avp-row avp-row-danger" onClick={() => { onSignOut?.(); onClose(); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h3.5A1.5 1.5 0 0 1 15 4.5v7A1.5 1.5 0 0 1 13.5 13H10M7 10l3-2-3-2M1 8h10"/></svg>
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </div>
  );
}

function RecentDeckRow({ deck, onOpenDeck, onClose }) {
  const { commander } = disassembleDecklist(deck.decklist_text);
  const [art, setArt] = useState(null);
  const cmdrName = commander ? commander.split(" && ")[0] : null;

  useEffect(() => {
    if (!cmdrName) return;
    let cancelled = false;
    getCardImage(cmdrName).then((d) => {
      if (!cancelled && d?.art_crop) setArt(d.art_crop);
    });
    return () => { cancelled = true; };
  }, [cmdrName]);

  const cardCount = (deck.decklist_text || "").split("\n")
    .filter((l) => /^\d/.test(l.trim()) && !/^Commander/i.test(l.trim()))
    .reduce((s, l) => s + (parseInt(l) || 0), 0);

  const isCmdr = deck.format === "commander" || deck.format === "paupercommander";
  const target = isCmdr ? 100 : 60;
  const countLabel = `${cardCount}/${target}`;

  return (
    <button
      className="avp-row"
      onClick={() => { onOpenDeck?.(deck); onClose(); }}
    >
      <div className="avp-deck-art">
        {art ? <img src={art} alt="" /> : <div className="avp-deck-art-placeholder" />}
      </div>
      <span className="avp-deck-name">{deck.name || "Untitled"}</span>
      <span className="avp-deck-count">{countLabel}</span>
    </button>
  );
}
