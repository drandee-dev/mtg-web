// Renders a Scryfall mana_cost string (e.g. "{2}{W}{B}", "{X}{R}{R}", "{2/U}")
// as small circular pips, colored to MTG's WUBRG identity. No font dependency —
// pure CSS circles, so this ships without adding to the bundle.

// Single-letter color/special symbols map to a pip class. Generic numbers and
// anything unrecognized fall back to the neutral "generic" pip with the raw glyph.
const PIP_CLASS = {
  W: "ts-pip-w",
  U: "ts-pip-u",
  B: "ts-pip-b",
  R: "ts-pip-r",
  G: "ts-pip-g",
  C: "ts-pip-c",
  X: "ts-pip-x",
  S: "ts-pip-c", // snow
};

// Hybrid/Phyrexian symbols like "2/U" or "W/P" — take the colored half for the
// pip background so the cost still reads as the right color at a glance.
function pipClassFor(token) {
  if (PIP_CLASS[token]) return PIP_CLASS[token];
  if (/^\d+$/.test(token)) return "ts-pip-generic";
  // hybrid: pick first WUBRG letter present
  const color = token.split("/").find((p) => PIP_CLASS[p] && p.length === 1);
  return color ? PIP_CLASS[color] : "ts-pip-generic";
}

// Shorten the glyph shown inside the pip. Hybrid "W/U" -> "" (color speaks),
// Phyrexian "W/P" -> "Φ", generic numbers keep their digits.
function glyphFor(token) {
  if (/^\d+$/.test(token)) return token;
  if (token.includes("/P")) return "Φ";
  if (token.includes("/")) return token.replace(/\//g, "");
  return token;
}

export default function ManaCost({ cost, className = "" }) {
  if (!cost) return null;
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (tokens.length === 0) return null;
  return (
    <span className={`ts-mana ${className}`} aria-label={`Mana cost ${tokens.join(" ")}`}>
      {tokens.map((t, i) => (
        <span key={i} className={`ts-pip ${pipClassFor(t)}`} aria-hidden="true">
          {glyphFor(t)}
        </span>
      ))}
    </span>
  );
}
