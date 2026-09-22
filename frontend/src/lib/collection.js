// Client-side counterpart to mtg-deck-builder's `mark_owned.py` (the CLI's
// "mark-owned" tool): parses a personal collection CSV and answers "do I
// own this card, and how many copies?"
//
// Ported rather than reimplemented, per the real function — not the
// startswith rule the job brief guessed at. `mark_owned.py` normalizes both
// sides (NFKD-fold + lowercase) and does an EXACT match on the folded key;
// it never does startswith or substring matching anywhere. That's actually
// the safer rule: startswith("island") still matches "Island of the
// Desert", which is exactly the false-positive the brief warned about.
// Exact-key matching avoids it outright.

/** NFKD-fold + lowercase, mirroring mtg_utils.names.normalize_card_name so
 *  "Lim-Dul's Vault" (ASCII collection export) matches "Lim-Dûl's Vault"
 *  (accented canonical spelling). */
export function normalizeCardName(name) {
  return (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Split one CSV line into fields, honoring double-quoted fields that may
 *  contain commas (e.g. `"Nykthos, Shrine to Nyx",,2`). No escaped-quote
 *  support — the collection export is plain name/set/quantity, never that. */
function splitCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { fields.push(cur); cur = ""; continue; }
    cur += ch;
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/** Parse a `name,set,quantity` collection CSV. Tolerant of a header row, an
 *  empty `set` field (a card with no set recorded), and malformed rows —
 *  a row with no name is skipped rather than aborting the whole import; a
 *  missing or unparseable quantity defaults to 1, matching the CLI's own
 *  CSV path (`parse_deck.parse_csv`). Returns `{rows, skipped}`. */
export function parseCollectionCsv(text) {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    const [nameRaw, setRaw, qtyRaw] = splitCsvLine(line);
    const name = (nameRaw || "").trim();
    if (!name) { skipped++; continue; }
    if (name.toLowerCase() === "name") continue; // header row, not data
    const parsedQty = Number.parseInt((qtyRaw || "").trim(), 10);
    const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    rows.push({ name, set: (setRaw || "").trim(), quantity });
  }
  return { rows, skipped };
}

/** Build a normalized-key -> {name, quantity} index, summing duplicate
 *  printings of the same card — a collection export lists each printing as
 *  its own row, so total owned copies is the sum. Mirrors mark_owned's
 *  collection-side `sum_duplicates=True` behavior. */
export function buildOwnedIndex(rows) {
  const entries = new Map();
  for (const r of rows) {
    const key = normalizeCardName(r.name);
    if (!key) continue;
    const existing = entries.get(key);
    if (existing) existing.quantity += r.quantity;
    else entries.set(key, { name: r.name, quantity: r.quantity });
  }
  return entries;
}

/** Owned copies of `name`, or 0. Exact match on the normalized key only. */
export function ownedQuantity(name, ownedIndex) {
  if (!ownedIndex) return 0;
  const hit = ownedIndex.get(normalizeCardName(name));
  return hit ? hit.quantity : 0;
}
