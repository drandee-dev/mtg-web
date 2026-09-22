// Hermetic backend mock for E2E tests. Intercepts every /api/** call so the suite
// runs without a live FastAPI server — the health check passes immediately
// and card metadata (mana cost, roles, price) is available for the stack views.
//
// Card images are inline SVG data URIs (no external network), colored by identity so
// columns read distinctly in screenshots.

const MOCK_CARDS = {
  "Sol Ring":             { mana_cost: "{1}",        cmc: 1, type_line: "Artifact",                                  roles: ["Ramp"],       price_usd: 1.99,  color_identity: [] },
  "Command Tower":        { mana_cost: "",           cmc: 0, type_line: "Land",                                      roles: [],             price_usd: 0.25,  color_identity: [] },
  "Arcane Signet":        { mana_cost: "{1}",        cmc: 1, type_line: "Artifact",                                  roles: ["Ramp"],       price_usd: 0.99,  color_identity: [] },
  "Swords to Plowshares": { mana_cost: "{W}",        cmc: 1, type_line: "Instant",                                   roles: ["Removal"],    price_usd: 1.50,  color_identity: ["W"] },
  "Counterspell":         { mana_cost: "{U}{U}",     cmc: 2, type_line: "Instant",                                   roles: ["Protection"], price_usd: 1.20,  color_identity: ["U"] },
  "Cultivate":            { mana_cost: "{2}{G}",     cmc: 3, type_line: "Sorcery",                                   roles: ["Ramp"],       price_usd: 0.50,  color_identity: ["G"] },
  "Kodama's Reach":       { mana_cost: "{2}{G}",     cmc: 3, type_line: "Sorcery",                                   roles: ["Ramp"],       price_usd: 0.75,  color_identity: ["G"] },
  "Rhystic Study":        { mana_cost: "{2}{U}",     cmc: 3, type_line: "Enchantment",                               roles: ["Draw"],       price_usd: 25.0,  color_identity: ["U"] },
  "Smothering Tithe":     { mana_cost: "{3}{W}",     cmc: 4, type_line: "Enchantment",                               roles: ["Ramp"],       price_usd: 20.0,  color_identity: ["W"] },
  "Deepglow Skate":       { mana_cost: "{4}{U}",     cmc: 5, type_line: "Creature — Fish",                          roles: ["Draw"],       price_usd: 3.0,   color_identity: ["U"] },
  "Atraxa, Praetors' Voice": { mana_cost: "{G}{W}{U}{B}", cmc: 4, type_line: "Legendary Creature — Phyrexian Angel Horror", roles: ["Commander"], price_usd: 12.0, color_identity: ["W", "U", "B", "G"] },
  "Lightning Bolt":       { mana_cost: "{R}",        cmc: 1, type_line: "Instant",                                   roles: ["Removal"],    price_usd: 2.50,  color_identity: ["R"] },
  "Malakir Rebirth":      { mana_cost: "{B}",        cmc: 1, type_line: "Instant // Land",                           roles: ["Protection"], price_usd: 1.10,  color_identity: ["B"] },
};

const COLOR_FILL = { W: "#d9d2b8", U: "#3a6ea5", B: "#2b2724", R: "#a83a2a", G: "#2f7d4f" };

function fillFor(ci) {
  if (!ci || ci.length === 0) return "#6b6f78";
  if (ci.length > 1) return "#b08d3a";
  return COLOR_FILL[ci[0]] || "#6b6f78";
}

function dataImg(ci) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='251'><rect width='100%' height='100%' fill='${fillFor(ci)}'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function cardPayload(name) {
  const m = MOCK_CARDS[name];
  if (!m) return { name, found: false, image: null, thumb: null };
  const img = dataImg(m.color_identity);
  return {
    name, found: true, image: img, thumb: img, art_crop: img,
    type_line: m.type_line, mana_cost: m.mana_cost, color_identity: m.color_identity,
    cmc: m.cmc, price_usd: m.price_usd, rarity: "rare", is_mdfc: false, roles: m.roles,
  };
}

export async function mockBackend(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (data) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

    if (path.endsWith("/api/health")) {
      return json({ status: "ok", warmed: true, data_as_of: "2026-01-01", ai_available: true, ai_budget_remaining_pct: 100, ai_calls_this_month: 0 });
    }
    if (path.endsWith("/api/cards/image")) {
      const name = url.searchParams.get("name");
      const names = url.searchParams.get("names");
      if (names) {
        const images = {};
        for (const n of names.split("|").map((s) => s.trim()).filter(Boolean)) images[n] = cardPayload(n);
        return json({ images });
      }
      return json(cardPayload(name || ""));
    }
    if (path.endsWith("/api/cards/search")) {
      const results = Object.keys(MOCK_CARDS).map((n) => {
        const c = cardPayload(n);
        return { name: c.name, type_line: c.type_line, cmc: c.cmc, prices: { usd: c.price_usd.toFixed(2) } };
      });
      return json({ count: results.length, results });
    }
    if (path.endsWith("/api/commanders/search")) {
      return json({ results: [cardPayload("Atraxa, Praetors' Voice")] });
    }
    if (path.endsWith("/api/commanders/directory")) {
      return json({
        as_of: "2026-01-01",
        commanders: [
          {
            name: "Atraxa, Praetors' Voice", slug: "atraxa-praetors-voice",
            color_identity: ["W", "U", "B", "G"], mana_cost: "{G}{W}{U}{B}", cmc: 4,
            type_line: "Legendary Creature — Phyrexian Angel Horror",
            oracle_text: "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",
            edhrec_rank: 3, price_usd: 12.0,
            playstyle: "Superfriends counters", difficulty: "Moderate",
            wins_via: ["Combat damage", "Planeswalker ultimates"], themes: ["Proliferate", "+1/+1 counters"],
          },
          {
            name: "Lightning Bolt", slug: "lightning-bolt-cmdr",
            color_identity: ["R"], mana_cost: "{R}", cmc: 1,
            type_line: "Legendary Creature — Mock Goblin",
            oracle_text: "Deal 3 damage to any target.",
            edhrec_rank: 500, price_usd: 2.5,
          },
        ],
      });
    }
    if (path.endsWith("/api/rules/ask/stream")) {
      // Server-sent events: the client reads `data: {json}` lines.
      const body =
        `data: ${JSON.stringify({ text: "Trample lets a creature assign excess combat damage to the player." })}\n\n` +
        `data: ${JSON.stringify({ citations: [{ rule: "702.19" }] })}\n\n`;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body });
    }
    if (path.endsWith("/api/rules/search")) {
      return json({ count: 1, results: [{ rule: "702.19", text: "Trample is a static ability." }] });
    }
    if (path.endsWith("/api/planeswalker/chat/stream")) {
      const reply = "Consider adding [[Lightning Bolt]] for cheap interaction.";
      const body =
        `data: ${JSON.stringify({ status: "streaming", text: reply })}\n\n` +
        `data: ${JSON.stringify({ status: "done", text: reply })}\n\n`;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body });
    }
    if (path.endsWith("/api/planeswalker/chat")) {
      // Non-streaming chat — the generator's "describe what you like" route
      // uses it to name one commander from free text.
      return json({ response: "Atraxa, Praetors' Voice" });
    }
    if (path.endsWith("/api/deck/composition")) {
      return json({
        format: "commander", is_commander: true,
        categories: [
          { key: "lands", label: "Lands", count: 34, target: 36, status: "ok" },
          { key: "ramp", label: "Ramp", count: 9, target: 10, status: "ok" },
          { key: "card-draw", label: "Card draw", count: 4, target: 10, status: "thin" },
          { key: "removal", label: "Spot removal", count: 7, target: 8, status: "ok" },
        ],
      });
    }
    if (path.endsWith("/api/deck/import-url")) {
      return json({
        name: "Mock Import",
        decklist: "Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Sol Ring\n1 Counterspell",
        sideboard: "1 Lightning Bolt",
        format: "commander",
        source: "archidekt",
      });
    }
    if (path.endsWith("/api/deck/analyze")) {
      return json({
        format: "commander", total_cards: 11,
        stats: { avg_cmc: 2.5 },
        mana: { overall_status: "OK", pip_demand_pct: {} },
        legality: { overall_status: "PASS", violations: [] },
        bracket: { bracket: 2, name: "Core", game_changers: [], mass_land_denial: [] },
        breakdown: { price_usd: 68.93, prices_as_of: "2026-07-01" },
      });
    }
    if (path.endsWith("/api/deck/recommend")) {
      return json({
        categories: {
          high_synergy: [
            { name: "Lightning Bolt", synergy: 0.92, in_deck: false },
            { name: "Rhystic Study", synergy: 0.85, in_deck: false },
            { name: "Smothering Tithe", synergy: 0.8, in_deck: false },
          ],
        },
      });
    }
    if (path.endsWith("/api/deck/optimize")) {
      return json({
        error: false,
        assessment: "Deck sits at bracket 2 against a bracket-3 target; this pass tightens ramp and draw.",
        changes: [
          { action: "swap", cut: "Cultivate", add: "Lightning Bolt", reason: "Cheap interaction the goals ask for over redundant ramp.", category: "Removal", impact: "high", price_usd: 2.5, cut_price_usd: 0.5, price_delta: 2.0 },
          { action: "cut", cut: "Kodama's Reach", add: null, reason: "Deck is over its card count; weakest duplicate effect.", category: "Ramp", impact: "medium", price_usd: null, cut_price_usd: 0.75, price_delta: -0.75 },
        ],
        model: "mock",
      });
    }
    if (path.endsWith("/api/deck/import-precon")) {
      // Server-side fuzzy match: the real endpoint 404s when nothing scores.
      const q = (url.searchParams.get("name") || "").toLowerCase();
      if (!q || !"necron dynasties".includes(q)) {
        return route.fulfill({
          status: 404, contentType: "application/json",
          body: JSON.stringify({ detail: "No preconstructed deck by that name." }),
        });
      }
      return json({
        name: "Necron Dynasties",
        set: "40K", release: "2022-10-07", type: "Commander Deck",
        commander: "Atraxa, Praetors' Voice",
        decklist: ["1 Sol Ring", "1 Arcane Signet", "1 Counterspell", "20 Swamp", "20 Island"].join("\n"),
        sideboard: "",
        format: "commander",
        alternates: [{ name: "Tyranid Swarm", release: "2022-10-07" }],
        source: "mtgjson",
      });
    }
    if (path.endsWith("/api/deck/wizard/skeleton")) {
      return json({
        error: false,
        commander: {
          name: "Atraxa, Praetors' Voice",
          color_identity: ["W", "U", "B", "G"],
          type_line: "Legendary Creature — Phyrexian Angel Horror",
          oracle_text: "Flying, vigilance, deathtouch, lifelink.",
          keywords: [], mana_cost: "{G}{W}{U}{B}",
        },
        skeleton: {
          staples: [
            { name: "Sol Ring", reason: "format staple" },
            { name: "Arcane Signet", reason: "format staple" },
          ],
          suggested_lands: [
            { name: "Command Tower", reason: "staple" },
            { name: "Plains" }, { name: "Island" }, { name: "Swamp" }, { name: "Forest" },
          ],
          high_synergy: [
            { name: "Deepglow Skate", synergy: 0.92 },
            { name: "Rhystic Study", synergy: 0.71 },
          ],
          top_cards: [
            { name: "Smothering Tithe", synergy: 0.6 },
            { name: "Cultivate", synergy: 0.4 },
          ],
          instants: [
            { name: "Swords to Plowshares", synergy: 0.5 },
            { name: "Counterspell", synergy: 0.45 },
          ],
          sorceries: [{ name: "Kodama's Reach", synergy: 0.3 }],
        },
        bracket: null,
      });
    }
    if (path.endsWith("/api/deck/wizard/narrate")) {
      // Echo the names back one per line, in the "Name: reason" shape the real
      // prompt asks for, so the client-side narration parser is exercised.
      const body = route.request().postDataJSON() || {};
      const names = body.card_names || [];
      return json({
        error: false,
        model: "mock",
        narration: names.map((n) => `- ${n}: Pulls its weight in the ${body.category || "deck"}.`).join("\n"),
      });
    }
    if (path.endsWith("/api/deck/ai/fills")) {
      return json({
        error: false,
        model: "mock",
        fills: [{
          category: "Card draw",
          suggestions: [{ name: "Malakir Rebirth", reason: "Cheap protection the draw-thin build wants." }],
          pool: [],
        }],
      });
    }
    if (path.endsWith("/api/deck/ai/cuts")) {
      return json({
        error: false,
        model: "mock",
        cuts: [{ name: "Cultivate", reason: "Weakest ramp once the signets are in." }],
      });
    }
    if (path.endsWith("/api/deck/ai/explain")) {
      const body = route.request().postDataJSON() || {};
      const names = body.card_names || [];
      return json({
        error: false,
        model: "mock",
        explanations: names.map((n) => ({ name: n, explanation: `Rated: pulls its weight for ${n}.` })),
      });
    }
    if (path.endsWith("/api/deck/budget-swaps")) {
      return json({
        total_savings: 19.01,
        swaps: [{ card: "Smothering Tithe", price: 20.0, alternative: { name: "Arcane Signet", price: 0.99 } }],
      });
    }
    if (path.endsWith("/api/deck/ai/upgrades")) {
      return json({
        error: false,
        model: "mock",
        upgrades: [{ replaces: "Cultivate", replacement: "Rhystic Study", reason: "Straight power increase.", price_usd: 25.0 }],
      });
    }
    // Generic fallback for deck analysis / AI endpoints not exercised here.
    return json({});
  });
}
