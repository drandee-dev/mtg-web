// Run with: node --test src/lib/goals.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GOALS, goalsToApi } from "./goals.js";

// Job 4b (Andres, 2026-11-06): an AI change leads with its strongest card even when the
// deck is over budget, unless the user picks savings first in Goals.
test("over budget: strongest first by default, savings first sent only with a budget", () => {
  assert.equal(DEFAULT_GOALS.overBudget, "strongest");
  const withBudget = { ...DEFAULT_GOALS, budgetCeiling: 300 };
  assert.equal(goalsToApi(withBudget).over_budget, undefined); // the default sends nothing
  assert.equal(goalsToApi({ ...withBudget, overBudget: "savings" }).over_budget, "savings");
  // Without a budget there is nothing to be over, so nothing changes the request,
  // also when another goal is set and the request goes out anyway (Holiday, 2026-11-06).
  assert.equal(goalsToApi({ ...DEFAULT_GOALS, overBudget: "savings" }), null);
  const noBudget = goalsToApi({ ...DEFAULT_GOALS, bracketTarget: 3, overBudget: "savings" });
  assert.equal(noBudget.bracket_target, 3);
  assert.equal(noBudget.over_budget, undefined);
});
