// Shared inline line-icons — thin 1.5 stroke, 16-unit viewBox, rounded caps, to
// match the landing-page SVGs (MyDecks.jsx) and replace stray color emoji in
// menus/action tiles with a single monochrome system. Icons draw in
// `currentColor`, so callers set the tint via CSS `color` on the wrapper.
function Icon({ size = 16, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2" />
      <path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8" />
    </Icon>
  );
}

// 5-point star — matches the landing "Guided" tile; used for Wizard / AI actions.
export function SparkleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 2L9 5.5H13L10 7.5L11 11L8 9L5 11L6 7.5L3 5.5H7L8 2Z" />
    </Icon>
  );
}

export function PaletteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 2.2C4.7 2.2 2 4.6 2 7.6c0 2.4 2 3.9 3.8 3.9.9 0 1.4.6 1.4 1.3 0 .5-.3.8-.3 1.2 0 .5.4.8.9.8 3.2 0 6.2-2.5 6.2-6C14 4.6 11.3 2.2 8 2.2Z" />
      <circle cx="5.3" cy="6.4" r=".55" fill="currentColor" stroke="none" />
      <circle cx="8" cy="5.3" r=".55" fill="currentColor" stroke="none" />
      <circle cx="10.6" cy="6.4" r=".55" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7" width="9" height="6.4" rx="1.2" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </Icon>
  );
}

export function UnlockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7" width="9" height="6.4" rx="1.2" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.9-.6" />
    </Icon>
  );
}

// "Paste a decklist" — lines metaphor, matching the landing "Paste List" tile.
export function ListIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 5h10M3 8h10M3 11h6" />
    </Icon>
  );
}

// Magnifier — geometry identical to the "cards" tab icon in BottomNav/GlobalToolbar
// so the app has exactly one search shape.
export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="6.5" r="4.5" />
      <line x1="10" y1="10" x2="14.5" y2="14.5" />
    </Icon>
  );
}
