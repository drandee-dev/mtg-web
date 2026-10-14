// New decks whose first save failed, kept in this browser so leaving the New
// deck screen, Back or a reload doesn't lose one (a built deck was paid for).
// Each is tagged with the account that made it (null: signed out) and offered
// only to that account. One goes when it is saved or discarded, never sooner.
//
// An entry is { id, owner, deck }, where deck is what was handed to
// createDeck: { name, format, decklist_text } plus notes, arrival and toast.

const KEY = "mtgweb:kept";

export function readKept() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list)
      ? list.filter((e) => e?.id && typeof e.deck?.name === "string" && typeof e.deck.decklist_text === "string")
      : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The new entry's id, or null when it could not be written (storage full
 * or blocked): then nothing is kept, and the caller must not say it is. */
export function keepDeck(owner, deck) {
  const id = crypto.randomUUID();
  return write([...readKept(), { id, owner: owner ?? null, deck }]) ? id : null;
}

export function dropKept(id) {
  write(readKept().filter((e) => e.id !== id));
}
