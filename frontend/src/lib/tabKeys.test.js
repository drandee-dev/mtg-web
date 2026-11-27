// Run with: node --test src/lib/tabKeys.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTab, tabStop } from "./tabKeys.js";

test("Left and Right wrap, Home and End go to the ends, other keys are not ours", () => {
  assert.equal(nextTab("ArrowRight", 0, 4), 1);
  assert.equal(nextTab("ArrowRight", 3, 4), 0);
  assert.equal(nextTab("ArrowLeft", 0, 4), 3);
  assert.equal(nextTab("ArrowLeft", 2, 4), 1);
  assert.equal(nextTab("Home", 2, 4), 0);
  assert.equal(nextTab("End", 0, 4), 3);
  for (const key of ["Enter", " ", "ArrowDown", "Tab", "a"]) assert.equal(nextTab(key, 1, 4), -1);
});

test("nothing moves when focus is not on a tab, or there are none", () => {
  assert.equal(nextTab("ArrowRight", -1, 4), -1);
  assert.equal(nextTab("ArrowRight", 0, 0), -1);
});

test("only the open tab is a Tab stop", () => {
  assert.equal(tabStop(true), 0);
  assert.equal(tabStop(false), -1);
});
