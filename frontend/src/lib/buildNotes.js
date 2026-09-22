// Per-card "why is this here" notes produced by the one-shot generator
// (wizard/narrate + the EDHREC synergy reasons that come with the skeleton).
// The card detail modal reads them so a generated deck explains itself in the
// normal deck view instead of needing its own screen.
//
// ponytail: module-level Map, so notes live for the session and are lost on
// reload. Keying by deckId in localStorage (like optimizeLog) is the upgrade
// path — it needs the deck to be saved first, and a freshly generated deck
// has no id until auto-save runs.

let _notes = new Map();

/** Replace the whole set. `notes` is a plain object of name → reason. */
export function setBuildNotes(notes) {
  _notes = new Map(Object.entries(notes || {}));
}

export function getBuildNote(name) {
  return _notes.get(name) || null;
}

export function clearBuildNotes() {
  _notes = new Map();
}

// Pull per-card sentences out of a wizard/narrate response. The prompt asks
// for one sentence per card, but the model formats it however it likes
// ("- Name: reason", "**Name** — reason", "Name - reason"), so match against
// the card names we actually asked about rather than guessing a bullet shape.
export function parseNarration(text, names) {
  const out = {};
  const lines = (text || "").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/^[\s\-*••]+/, "").replace(/^\d+[.)]\s*/, "").trim();
    if (!line) continue;
    for (const name of names) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = line.match(new RegExp(`^\\*{0,2}${esc}\\*{0,2}\\s*[:\\u2014\\u2013-]\\s*(.+)$`, "i"));
      if (m) {
        const reason = m[1].trim();
        if (reason) out[name] = reason;
        break;
      }
    }
  }
  return out;
}
