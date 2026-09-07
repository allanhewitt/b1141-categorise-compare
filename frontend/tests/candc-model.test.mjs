import test from "node:test";
import assert from "node:assert/strict";
import { CANDC_PROFILE_ID, profileVars } from "../src/candc/profile.js";
import { chooseExplicitNone, completeSet, responseLabels, toggleCategory } from "../src/candc/model.js";

const base = {
  classification: {
    mode: "multi_tag",
    explicit_none: { enabled: true, id: "none", label: "No clear category" },
  },
  items: [{ id: "one" }, { id: "two" }],
  categories: [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ],
};

test("C&C has a bounded sorting-workbench visual profile", () => {
  assert.equal(CANDC_PROFILE_ID, "candc_sorting_workbench_v1");
  const changed = profileVars({
    background: "x", panel: "y", panelRaised: "z", paper: "p", paperInk: "i",
    text: "t", muted: "m", accent: "a", accentInk: "ai", line: "l", radius: "r",
  });
  assert.equal(changed["--candc-bg"], "x");
  assert.equal(changed["--candc-paper"], "p");
});

test("multi-tag interaction toggles several labels", () => {
  const first = toggleCategory(base, { category_ids: [], explicit_none: false }, "a");
  const second = toggleCategory(base, first, "b");
  assert.deepEqual(new Set(second.category_ids), new Set(["a", "b"]));
  assert.equal(second.explicit_none, false);
});

test("exclusive interaction replaces the previous label", () => {
  const config = { ...base, classification: { ...base.classification, mode: "exclusive" } };
  const next = toggleCategory(config, { category_ids: ["a"], explicit_none: false }, "b");
  assert.deepEqual(next, { category_ids: ["b"], explicit_none: false });
});

test("explicit neutral state remains distinct from unanswered", () => {
  assert.deepEqual(chooseExplicitNone(true), { category_ids: [], explicit_none: true });
  assert.equal(completeSet(base, { one: chooseExplicitNone(true) }), false);
  assert.equal(completeSet(base, { one: chooseExplicitNone(true), two: { category_ids: ["a"], explicit_none: false } }), true);
});

test("learner summary uses authored labels rather than internal ids", () => {
  assert.deepEqual(responseLabels(base, { category_ids: ["a", "b"], explicit_none: false }), ["Alpha", "Beta"]);
  assert.deepEqual(responseLabels(base, chooseExplicitNone(true)), ["No clear category"]);
});
