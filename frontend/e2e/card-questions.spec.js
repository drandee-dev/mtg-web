// The card modal's two questions, answered in place (UX overhaul job 4.2):
// "Why is this here?" for a card with no build note, and "Rules with <my
// commander>" streaming under the buttons. Neither leaves the deck page.
// Runs against the hermetic mock backend.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openCard(page, name) {
  await page.locator(`.card-grid-container [aria-label*="${name}"]`).first().click();
  const modal = page.locator(".cdm-panel");
  await expect(modal).toBeVisible();
  return modal;
}

test.describe("Card modal questions", () => {
  // A touch screen needs two taps on a stacked card; the other modal specs skip it too.
  test.skip(({ isMobile }) => isMobile, "desktop flow");

  test("Rules with my commander streams in place and names both cards", async ({ page }) => {
    const asked = [];
    await page.route("**/api/rules/ask/stream", (route) => {
      asked.push(route.request().postDataJSON().question);
      return route.fallback();
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const url = page.url();
    const modal = await openCard(page, "Sol Ring");

    await modal.getByRole("button", { name: /^Rules with Atraxa/ }).click();
    await expect(modal.locator(".cdm-answer")).toContainText("Trample lets a creature");
    await expect(modal.locator(".cdm-citation")).toContainText("Rule 702.19");
    // No hop to the Rules page, and the modal is still open.
    expect(page.url()).toBe(url);
    await expect(modal).toBeVisible();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("Sol Ring");
    expect(asked[0]).toContain("Atraxa");
  });

  test("Why is this here? asks about the one card, and only when there is no build note", async ({ page }) => {
    const explained = [];
    await page.route("**/api/deck/ai/explain", (route) => {
      explained.push(route.request().postDataJSON().card_names);
      return route.fallback();
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const modal = await openCard(page, "Sol Ring");

    await expect(modal.locator(".cdm-answer")).toHaveCount(0); // nothing is asked on open
    expect(explained).toHaveLength(0);
    await modal.getByRole("button", { name: "Why is this here?" }).click();
    await expect(modal.locator(".cdm-answer")).toContainText("pulls its weight for Sol Ring");
    expect(explained).toEqual([["Sol Ring"]]);
  });

  test("the commander's own modal offers Rules only", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const modal = await openCard(page, "Atraxa");
    await expect(modal.getByRole("button", { name: "Rules", exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Why is this here?" })).toHaveCount(0);
  });

  test("an answer does not follow the modal to another card", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    let modal = await openCard(page, "Sol Ring");
    await modal.getByRole("button", { name: "Why is this here?" }).click();
    await expect(modal.locator(".cdm-answer")).toBeVisible();
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".cdm-panel")).toHaveCount(0);

    modal = await openCard(page, "Atraxa");
    await expect(modal.locator(".cdm-answer")).toHaveCount(0);
  });

  test("a failed answer says so in the modal", async ({ page }) => {
    await page.route("**/api/deck/ai/explain", (route) => route.fulfill({ status: 500, json: { detail: "no" } }));
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const modal = await openCard(page, "Sol Ring");
    await modal.getByRole("button", { name: "Why is this here?" }).click();
    await expect(modal.locator(".cdm-answer.is-error")).toContainText("Couldn't get an answer");
  });
});
