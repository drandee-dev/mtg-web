// The Verdict's status line (audit job 4.3, replacing the 0–100 score): one
// short phrase per check, from the deterministic audits, each saying in words
// what is wrong so the colour is only a second cue. Legality, mana and roles
// always show; the card count and colour fixing only when they fall short.
// Returns null until there is a deck to read.

const toneOf = (s) => (s === "FAIL" ? "bad" : "warn");

export function statusParts(result, comp) {
  if (!result || !result.total_cards) return null;
  const size = 100; // both served formats are 100-card ones (audit job 5.6)
  // `key` names the check, so Health (audit job 6.2) can leave out the two its
  // role rows already show: "lands" and "roles".
  const parts = [
    result.legality?.overall_status === "FAIL"
      ? { key: "legal", text: "Not legal", tone: "bad" }
      : { key: "legal", text: "Legal", tone: "ok" },
  ];
  if (result.total_cards < size) parts.push({ key: "size", text: `${result.total_cards} of ${size} cards`, tone: "warn" });
  const v = result.mana?.viability;
  if (v && v.land_status && v.land_status !== "PASS") {
    parts.push({ key: "lands", text: `mana short (${v.land_count} of ${v.land_floor} lands)`, tone: toneOf(v.land_status) });
  } else if (v && v.sources_status && v.sources_status !== "PASS") {
    parts.push({
      key: "mana", text: `mana short (${v.mana_sources} of ${v.recommended_sources} sources)`, tone: toneOf(v.sources_status),
    });
  } else if (v && v.status && v.status !== "PASS" && !v.land_status && !v.sources_status) {
    // An older saved result without the two checks: trust its overall status.
    parts.push({ key: "mana", text: "mana short", tone: toneOf(v.status) });
  } else if (v) {
    parts.push({ key: "mana", text: "mana ok", tone: "ok" });
  }
  const fixing = result.mana?.color_balance_status;
  if (fixing && fixing !== "PASS") parts.push({ key: "fixing", text: "color fixing weak", tone: toneOf(fixing) });
  const cats = comp?.categories?.filter((c) => c.target) || [];
  const thin = cats.filter((c) => c.status === "thin").length;
  if (thin) parts.push({ key: "roles", text: `${thin} thin role${thin === 1 ? "" : "s"}`, tone: "warn" });
  else if (cats.length) parts.push({ key: "roles", text: "roles on target", tone: "ok" });
  return parts;
}
