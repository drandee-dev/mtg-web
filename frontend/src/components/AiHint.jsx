// A small "✨ AI" badge with a tooltip, marking sections that the Phase 2 AI layer
// will power or improve. Makes the upcoming intelligence visible without implying
// it's active yet.
export default function AiHint({ children }) {
  return (
    <span className="ai-hint" tabIndex={0} aria-label={`Coming with AI: ${children}`}>
      ✨ AI
      <span className="ai-tip" role="tooltip">
        <strong>Coming in the AI phase.</strong> {children}
      </span>
    </span>
  );
}
