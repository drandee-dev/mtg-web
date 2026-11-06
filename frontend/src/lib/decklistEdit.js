// Edits to a decklist's text, as pure functions (no React, no window), so
// `node --test` can run them. DeckView used to build the same line regex in
// three places; every card edit goes through here now.
//
// A deck line is "<qty> <name>", optionally followed by a pinned printing,
// "1 Sol Ring (C21) 263".

/** Escape a card name for use inside a RegExp. */
export function escapeRegExp(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The printing suffix a deck line may carry: " (SET) 123".
const PRINT_SUFFIX_SRC = "(\\s+\\([A-Za-z0-9]{2,6}\\)\\s+[A-Za-z0-9★†-]{1,10})?";

/** A regex matching one line for `name`: quantity, the name, an optional
 * printing. Group 1 is the printing suffix, if any. */
export function cardLineRegex(name) {
  return new RegExp(`^\\s*\\d+\\s+${escapeRegExp(name)}${PRINT_SUFFIX_SRC}\\s*$`, "i");
}

/** The exact line for a card (quantity and printing included), or null. */
export function findDeckLine(text, name) {
  const re = cardLineRegex(name);
  return text.split("\n").find((l) => re.test(l)) || null;
}

/** Section headers whose cards are not in the deck: the Considering pile, a
 * companion (it starts the game outside the deck) and a sideboard (the importers
 * send it to Considering; counted, a constructed 60 + 15 read 75). Shared with
 * deckParser. */
export const OUTSIDE_SECTION = /^\s*(maybeboard|companion|sideboard)\s*$/i;
const ANY_SECTION = /^\s*(commander|deck|sideboard|maybeboard|companion)\s*$/i;

/** `line` added as the deck's last card. Text can hold section headers ("Edit as
 * text" takes anything): the line goes after the last Deck section, before any
 * Companion, Sideboard or Maybeboard section that follows it. Appended inside such
 * a section, a new card vanished from the deck; inserted before an earlier one
 * (Arena's Commander, Companion, Deck order) it joined the commanders (Holiday,
 * 2026-11-06). If the last such header is Commander, a Deck header comes first. */
export function appendLine(text, line) {
  const lines = text.replace(/\s*$/, "").split("\n");
  let lastIn = -1;
  lines.forEach((l, i) => { if (ANY_SECTION.test(l) && !OUTSIDE_SECTION.test(l)) lastIn = i; });
  const add = lastIn >= 0 && /^\s*commander\s*$/i.test(lines[lastIn]) ? ["Deck", line] : [line];
  const at = lines.findIndex((l, i) => i > lastIn && OUTSIDE_SECTION.test(l));
  if (at < 0) return `${lines.join("\n")}\n${add.join("\n")}`;
  let i = at;
  while (i > lastIn + 1 && !lines[i - 1].trim()) i--;
  lines.splice(i, 0, ...add);
  return lines.join("\n");
}

/** The text without the first line for `name`; unchanged when there is none. */
export function removeLine(text, name) {
  const lines = text.split("\n");
  const re = cardLineRegex(name);
  const idx = lines.findIndex((l) => re.test(l));
  if (idx >= 0) lines.splice(idx, 1);
  return lines.join("\n");
}

/** The card's copy count set to `qty` as a single "N Name" line: duplicate
 * lines collapse into the first, a pinned printing is kept, and a `qty` of 0 or
 * less removes the card. A card that was not there is added at the end. */
export function setQty(text, name, qty) {
  const re = cardLineRegex(name);
  const out = [];
  let placed = false;
  for (const l of text.split("\n")) {
    const m = l.match(re);
    if (m) {
      if (!placed && qty > 0) { out.push(`${qty} ${name}${m[1] || ""}`); placed = true; }
    } else {
      out.push(l);
    }
  }
  if (!placed && qty > 0) return appendLine(out.join("\n"), `${qty} ${name}`);
  return out.join("\n");
}
