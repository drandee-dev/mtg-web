// Planeswalker chat — Phase 4 upgrades: topic dividers per quick action,
// pinned session log (synced with the Optimize queue via the optlog
// broadcast), expand + text-size toggles. Runs against the hermetic mock
// (mock /api/planeswalker/chat/stream replies with a [[Lightning Bolt]] chip).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openChat(page) {
  await page.locator(".planeswalker-btn").click();
  await expect(page.locator(".planeswalker-panel")).toBeVisible();
}

test.describe("Planeswalker chat", () => {
  test("quick action drops a topic divider and streams a reply", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);

    await page.locator(".pw-chip", { hasText: "Suggest cuts" }).click();
    await expect(page.locator(".pw-divider")).toContainText("Suggest cuts");
    await expect(page.locator(".pw-cardchip-name", { hasText: "Lightning Bolt" })).toBeVisible();
  });

  test("divider survives a reload (persisted history)", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Find combos" }).click();
    await expect(page.locator(".pw-divider")).toContainText("Find combos");
    // Wait for the exchange to complete so history persists
    await expect(page.locator(".pw-cardchip-name").first()).toBeVisible();

    await page.reload();
    await openChat(page);
    await expect(page.locator(".pw-divider")).toContainText("Find combos");
  });

  test("chat card-chip add lands in the pinned session log", async ({ page, isMobile }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();

    const addBtn = page.locator('.pw-cardchip-btn[aria-label="Add Lightning Bolt to deck"]');
    await addBtn.click();

    const log = page.locator(".pw-sessionlog");
    await expect(log.locator("summary")).toContainText("Session changes (1)");
    await log.locator("summary").click();
    await expect(log.locator(".pw-sessionlog-row")).toContainText("Added Lightning Bolt");
    await expect(log.locator(".pw-sessionlog-src")).toHaveText("chat");

    if (!isMobile) {
      // Broadcast sync: the sidebar queue's log picked up the chat add too
      await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
    }
  });

  test("an empty 'done' stream shows an error with Retry, not Thinking… forever", async ({ page }) => {
    // Prod 2026-09-27: the model spent max_tokens thinking and the stream
    // ended done with no text. Registered after the shared mock, so it wins.
    await page.route("**/api/planeswalker/chat/stream", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ status: "done", text: "", output_tokens: 2000 })}\n\n`,
      }),
    );
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();

    const reply = page.locator(".pw-msg.pw-assistant").last();
    await expect(reply).toContainText("empty reply");
    await expect(reply.locator(".pw-retry")).toBeVisible();
    await expect(reply).not.toContainText("Thinking");
  });

  test("chips follow the server verdict: ok adds, in-deck neutral, off-color muted, unknown plain", async ({ page }) => {
    const reply = "Try [[Sol Ring]], [[Lightning Bolt]], [[Malakir Rebirth]] and [[Fake Card]].";
    await page.route("**/api/planeswalker/chat/stream", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ status: "done", text: reply })}\n\n`,
      }));
    const verdicts = {
      "Sol Ring": { status: "in_deck", reason: "Already in the deck" },
      "Lightning Bolt": { status: "off_color", reason: "Outside the deck's color identity (WUBG)" },
      "Malakir Rebirth": { status: "ok", reason: "" },
      "Fake Card": { status: "unknown", reason: "No card by that name" },
    };
    const calls = [];
    await page.route("**/api/deck/validate-cards", (route) => {
      const { names } = route.request().postDataJSON();
      calls.push(names);
      const results = names.map((n) => ({ input: n, name: verdicts[n].status === "unknown" ? null : n, ...verdicts[n] }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ identity: ["W", "U", "B", "G"], identity_source: "commander", results }) });
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();

    await expect(page.locator('.pw-cardchip-btn[aria-label="Add Malakir Rebirth to deck"]')).toBeVisible();
    const inDeck = page.locator(".pw-cardchip-indeck", { hasText: "Sol Ring" });
    await expect(inDeck).toContainText("in deck");
    await expect(inDeck.locator("button")).toHaveCount(0);
    const offColor = page.locator(".pw-cardchip-muted", { hasText: "Lightning Bolt" });
    await expect(offColor).toHaveAttribute("title", /color identity/);
    await expect(offColor.locator("button")).toHaveCount(0);
    const reply$ = page.locator(".pw-msg.pw-assistant").last();
    await expect(reply$).toContainText("Fake Card");
    await expect(reply$.locator(".pw-cardchip-name", { hasText: "Fake Card" })).toHaveCount(0);
    expect(calls).toHaveLength(1); // one validate call per message
  });

  test("reloaded history chips are not actionable (verdicts aren't persisted)", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();
    await expect(page.locator('.pw-cardchip-btn[aria-label="Add Lightning Bolt to deck"]')).toBeVisible();

    await page.reload();
    await openChat(page);
    const reply = page.locator(".pw-msg.pw-assistant").last();
    await expect(reply.locator(".pw-cardname", { hasText: "Lightning Bolt" })).toBeVisible();
    await expect(reply.locator(".pw-cardchip-btn")).toHaveCount(0);
  });

  test("a failed validate call leaves chips without add buttons (fail closed)", async ({ page }) => {
    await page.route("**/api/deck/validate-cards", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Card validation failed." }) }));
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    const failed = page.waitForResponse((r) => r.url().includes("/api/deck/validate-cards"));
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();
    await failed;
    const reply = page.locator(".pw-msg.pw-assistant").last();
    await expect(reply.locator(".pw-cardname", { hasText: "Lightning Bolt" })).toBeVisible();
    await expect(reply.locator(".pw-cardchip-btn")).toHaveCount(0);
  });

  test("expand and text-size toggles persist across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    const panel = page.locator(".planeswalker-panel");

    await page.locator('button[aria-label="Expand panel"]').click();
    await expect(panel).toHaveClass(/pw-expanded/);
    await page.locator('button[aria-label="Larger chat text"]').click();
    await expect(panel).toHaveClass(/pw-textlg/);

    await page.reload();
    await openChat(page);
    await expect(page.locator(".planeswalker-panel")).toHaveClass(/pw-expanded/);
    await expect(page.locator(".planeswalker-panel")).toHaveClass(/pw-textlg/);
  });

  test("Load into deck adds only cards the gate passes", async ({ page }) => {
    // A reply with 10+ "1 Name" lines is a detected decklist: AI output, so
    // an off-color line in it must not reach the deck.
    const names = ["Lightning Bolt", "Opt", "Ponder", "Brainstorm", "Preordain",
      "Llanowar Elves", "Birds of Paradise", "Path to Exile", "Duress", "Thoughtseize"];
    const reply = names.map((n) => `1 ${n}`).join("\n");
    await page.route("**/api/planeswalker/chat/stream", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ status: "done", text: reply })}\n\n`,
      }));
    await page.route("**/api/deck/validate-cards", (route) => {
      const results = route.request().postDataJSON().names.map((n) => (n === "Lightning Bolt"
        ? { input: n, name: n, status: "off_color", reason: "Outside the deck's color identity (WUBG)" }
        : { input: n, name: n, status: "ok", reason: "" }));
      return route.fulfill({ json: { identity: ["W", "U", "B", "G"], identity_source: "commander", results } });
    });
    const analyzed = [];
    await page.route("**/api/deck/analyze", (route) => {
      analyzed.push(route.request().postDataJSON().decklist);
      return route.fallback();
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();

    await page.getByRole("button", { name: "Load into deck" }).click();
    await expect(page.locator(".toast")).toContainText("Added 9 to the deck (1 skipped");
    await expect.poll(() => analyzed.at(-1) || "", { timeout: 15000 }).toContain("1 Thoughtseize");
    expect(analyzed.at(-1)).not.toContain("Lightning Bolt");
  });
});
