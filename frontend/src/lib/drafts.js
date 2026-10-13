// Unsaved edits to a saved deck, kept in this browser so leaving the deck
// (another deck, Back, a reload, a closed tab) doesn't lose them. Save stays
// the only thing that writes to the deck itself.
//
// A draft is the deck's storage form, { format, decklist_text }, so it covers
// the commander, the format and Considering as well as the cards.
//
// ponytail: a draft carries no timestamp, so one older than a save made on
// another device is restored over that save (still marked Unsaved, and
// "Discard changes" drops it). Store the deck's updated_at with the draft and
// compare on restore if cross-device edits start colliding.

const key = (deckId) => `mtgweb:draft:${deckId}`;

export function loadDraft(deckId) {
  try {
    const draft = JSON.parse(localStorage.getItem(key(deckId)));
    return typeof draft?.decklist_text === "string" ? draft : null;
  } catch {
    return null;
  }
}

/** True when the draft was written. False means storage is full or blocked,
 * and the caller has to protect the edits some other way. */
export function saveDraft(deckId, draft) {
  try {
    localStorage.setItem(key(deckId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(deckId) {
  try { localStorage.removeItem(key(deckId)); } catch { /* storage blocked */ }
}
