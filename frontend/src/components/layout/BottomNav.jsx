import NavLink from "./NavLink";

const ICONS = {
  decks: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  commanders: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M2 12.5h12l-1-6.5-3 3-2-4-2 4-3-3-1 6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  cards: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  rules: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M8 3.5v10M8 3.5C8 3.5 6.5 2 3 2v10c3.5 0 5 1.5 5 1.5M8 3.5C8 3.5 9.5 2 13 2v10c-3.5 0-5 1.5-5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

const PLUS = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10"/>
  </svg>
);

// The phone's bar: the four places with "New deck" in the middle. `place` is
// the place the screen belongs to, so Decks stays lit inside a deck.
export default function BottomNav({ places, place, setTab, onNewDeck, onNew }) {
  const link = ([id, label, href]) => (
    <NavLink key={id} href={href} current={place === id} className="bn-link" onNavigate={() => setTab(id)}>
      {ICONS[id]}
      {label}
    </NavLink>
  );
  return (
    <nav className="bottom-nav" aria-label="Main">
      {places.slice(0, 2).map(link)}
      <NavLink href="/new" current={onNew} className="bn-link bn-new" onNavigate={onNewDeck}>
        <span className="bn-new-mark">{PLUS}</span>
        New deck
      </NavLink>
      {places.slice(2).map(link)}
    </nav>
  );
}
