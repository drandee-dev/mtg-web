// Deck Goals — the user's declared optimization intent, saved per deck and
// threaded into every AI feature (cuts, fills, upgrades, chat). localStorage
// v1; cross-device sync can move this into the decks table later.

export const DEFAULT_GOALS = {
  bracketTarget: null, // 1-5, or null = "keep current"
  budgetCeiling: null, // dollars, or null = no ceiling
  protected: [],       // card names the AI must never cut/replace
  pilot: "any",        // "simple" | "moderate" | "any"
  flavorNote: "",      // free text, e.g. "Mutate tribal. No infinite combos."
};

export const FLAVOR_SUGGESTIONS = [
  "No infinite combos.",
  "Keep it flavorful over efficient.",
  "Prefer creatures over spells.",
  "Theme beats power.",
];

const key = (deckId) => `mtgweb:goals:${deckId || "current"}`;

export function loadGoals(deckId) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(deckId)) || "null");
    return raw ? { ...DEFAULT_GOALS, ...raw } : { ...DEFAULT_GOALS };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export function saveGoals(deckId, goals) {
  try {
    const isDefault =
      !goals.bracketTarget && !goals.budgetCeiling && !goals.protected.length &&
      goals.pilot === "any" && !goals.flavorNote.trim();
    if (isDefault) localStorage.removeItem(key(deckId));
    else localStorage.setItem(key(deckId), JSON.stringify(goals));
  } catch { /* storage full/blocked — goals are best-effort */ }
}

// Snake-case payload for the backend's GoalsPayload; null when nothing is set
// so requests without goals stay byte-identical to before (prompt cache).
export function goalsToApi(goals) {
  if (!goals) return null;
  const hasAny =
    goals.bracketTarget || goals.budgetCeiling || goals.protected.length > 0 ||
    (goals.pilot && goals.pilot !== "any") || goals.flavorNote.trim();
  if (!hasAny) return null;
  return {
    ...(goals.bracketTarget ? { bracket_target: goals.bracketTarget } : {}),
    ...(goals.budgetCeiling ? { budget_ceiling: goals.budgetCeiling } : {}),
    ...(goals.protected.length ? { protected: goals.protected.slice(0, 15) } : {}),
    ...(goals.pilot && goals.pilot !== "any" ? { pilot: goals.pilot } : {}),
    ...(goals.flavorNote.trim() ? { flavor_note: goals.flavorNote.trim().slice(0, 300) } : {}),
  };
}

// Compact chips for the collapsed summary row.
export function goalsSummary(goals) {
  const chips = [];
  if (goals.bracketTarget) chips.push(`B${goals.bracketTarget} target`);
  if (goals.budgetCeiling) chips.push(`≤ $${goals.budgetCeiling}`);
  if (goals.protected.length) chips.push(`${goals.protected.length} protected`);
  if (goals.pilot && goals.pilot !== "any") chips.push(`pilot: ${goals.pilot}`);
  if (goals.flavorNote.trim()) chips.push("note");
  return chips;
}
