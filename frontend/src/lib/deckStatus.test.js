// Run with: node --test src/lib/deckStatus.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusParts } from "./deckStatus.js";

const line = (r, c) => statusParts(r, c)?.map((p) => `${p.text}:${p.tone}`).join(" | ");
const via = (o) => ({ land_status: "PASS", sources_status: "PASS", ...o });
const cats = (...statuses) => ({ categories: statuses.map((status, i) => ({ key: `k${i}`, target: 5, status })) });

test("nothing to read until the deck has cards", () => {
  assert.equal(statusParts(null, null), null);
  assert.equal(statusParts({ total_cards: 0 }, null), null);
});

test("Sliver Swarm: legal, 37 of 41 lands, one thin role (the audit's example)", () => {
  const r = {
    total_cards: 100, legality: { overall_status: "PASS" },
    mana: { viability: via({ land_status: "WARN", land_count: 37, land_floor: 41 }), color_balance_status: "PASS" },
  };
  assert.equal(line(r, cats("thin", "ok")), "Legal:ok | mana short (37 of 41 lands):warn | 1 thin role:warn");
});

test("a healthy deck says so in words", () => {
  const r = { total_cards: 100, legality: { overall_status: "PASS" }, mana: { viability: via({}) } };
  assert.equal(line(r, cats("ok", "ok")), "Legal:ok | mana ok:ok | roles on target:ok");
});

test("not legal, short of cards, sources short, weak fixing, two thin roles", () => {
  const r = {
    total_cards: 92, legality: { overall_status: "FAIL" },
    mana: {
      viability: via({ sources_status: "FAIL", mana_sources: 40, recommended_sources: 46 }),
      color_balance_status: "WARN",
    },
  };
  assert.equal(line(r, cats("thin", "thin")),
    "Not legal:bad | 92 of 100 cards:warn | mana short (40 of 46 sources):bad | color fixing weak:warn | 2 thin roles:warn");
});

test("an older saved result with only an overall mana status never reads ok when it isn't", () => {
  const r = { total_cards: 100, mana: { viability: { status: "WARN" } } };
  assert.equal(line(r, null), "Legal:ok | mana short:warn");
});

test("a 60-card format counts against 60, and missing audits are left out", () => {
  assert.equal(line({ total_cards: 58, format: "standard" }, null), "Legal:ok | 58 of 60 cards:warn");
});
