// The labelled Ask button, in the top bar and in the phone's deck bar. A toggle:
// expanded while the drawer is open.
export default function AskButton({ onClick, pressed, className = "" }) {
  return (
    <button type="button" className={`ask-btn ${className}`} onClick={onClick}
      aria-expanded={Boolean(pressed)}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinejoin="round"><path d="M2.5 3h11v8h-6l-3 2.5V11h-2z" /></svg>
      <span className="ask-btn-label">Ask</span>
    </button>
  );
}
