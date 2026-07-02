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
    // Generic fallback for deck analysis / AI endpoints not exercised here.
    return json({});
  });
}
