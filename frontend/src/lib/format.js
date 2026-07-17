// Locale-aware display formatting (visual-standards audit 2026-07-17).
// One shared USD formatter so prices render "$1,234.56" everywhere instead of
// string-glued `$${x.toFixed(2)}` (which drops thousands separators).

const _usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function fmtUsd(n) {
  return _usd.format(Number(n));
}
