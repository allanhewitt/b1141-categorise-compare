import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCandCConfig,
  buildCohortAggregate,
  hashParticipantToken,
  learnerSafeConfig,
  validateCompleteClassification,
  validateItemResponse,
  validateResolution,
} from "../lib/candc.js";

function baseConfig(mode = "exclusive", explicitNone = false) {
  return {
    entry: { text: "Sort these cases." },
    classification: {
      mode,
      response_required_per_item: true,
      min_tag_selections: mode === "multi_tag" ? 0 : null,
      max_tag_selections: mode === "multi_tag" ? 2 : 1,
      explicit_none: explicitNone
        ? { enabled: true, id: "none", label: "I don't see a clear fit", mutually_exclusive_with_tags: true }
        : { enabled: false },
    },
    items: [
      { id: "i1", content: "Case one", display_order: 1 },
      { id: "i2", content: "Case two", display_order: 2 },
      { id: "i3", content: "Case three", display_order: 3 },
    ],
    categories: [
      { id: "a", label: "A", display_order: 1 },
      { id: "b", label: "B", display_order: 2 },
      { id: "c", label: "C", display_order: 3 },
    ],
    commitment: { submission_mode: "batch", require_complete_set: true },
    confrontation: {
      source: "cohort_computational",
      reveal_mode: "lecturer_gated",
      show_learner_original: true,
      diagnostic_rule: "highest_divergence",
      required_outputs: ["completion_count", "item_category_distribution", "divergence_by_item", "selected_diagnostic_item"],
    },
    guidance: { content: [{ type: "question", text: "What makes this difficult to place?" }] },
    resolution: {
      pattern: "divergence",
      diagnostic_item_source: "confrontation",
      allow_revision: true,
      revision_mode: mode === "exclusive" ? "replace" : "edit_tag_set",
      prompt: "Would you change anything?",
      options: [
        { id: "keep_same", label: "Keep the same", display_order: 1 },
        { id: "recognise_other_keep_mine", label: "I can see another reading", display_order: 2 },
        { id: mode === "exclusive" ? "change_classification" : "change_tagging", label: "Change it", display_order: 3 },
      ],
    },
    lecturer: { pre_reveal_view: "response_count_only", reveal_control: "manual", projector_summary: true, reset_session: true },
  };
}

function exclusiveClassification(a, b, c) {
  return {
    i1: { category_ids: [a], explicit_none: false },
    i2: { category_ids: [b], explicit_none: false },
    i3: { category_ids: [c], explicit_none: false },
  };
}

test("validates exclusive and multi-tag configurations", () => {
  assert.equal(assertCandCConfig(baseConfig("exclusive")), true);
  assert.equal(assertCandCConfig(baseConfig("multi_tag", true)), true);
});

test("explicit neutral response is distinct from unanswered", () => {
  const config = baseConfig("multi_tag", true);
  assert.equal(validateItemResponse(config, "i1", {}).valid, false);
  assert.equal(validateItemResponse(config, "i1", { explicit_none: true, category_ids: [] }).valid, true);
  assert.equal(validateItemResponse(config, "i1", { explicit_none: true, category_ids: ["a"] }).valid, false);
});

test("batch commitment requires every item", () => {
  const config = baseConfig("exclusive");
  const incomplete = { i1: { category_ids: ["a"] }, i2: { category_ids: ["b"] } };
  assert.equal(validateCompleteClassification(config, incomplete).valid, false);
  assert.equal(validateCompleteClassification(config, exclusiveClassification("a", "b", "c")).valid, true);
});

test("exclusive divergence selects the most split item", () => {
  const config = baseConfig("exclusive");
  const aggregate = buildCohortAggregate(config, [
    exclusiveClassification("a", "a", "c"),
    exclusiveClassification("a", "b", "c"),
    exclusiveClassification("a", "c", "c"),
  ]);
  assert.equal(aggregate.participant_count, 3);
  assert.equal(aggregate.divergence.i1, 0);
  assert.ok(aggregate.divergence.i2 > aggregate.divergence.i1);
  assert.equal(aggregate.diagnostic_item_id, "i2");
});

test("multi-tag aggregation treats tag incidences independently and counts explicit neutral", () => {
  const config = baseConfig("multi_tag", true);
  const aggregate = buildCohortAggregate(config, [
    {
      i1: { category_ids: ["a", "b"], explicit_none: false },
      i2: { category_ids: ["a"], explicit_none: false },
      i3: { category_ids: [], explicit_none: true },
    },
    {
      i1: { category_ids: ["a"], explicit_none: false },
      i2: { category_ids: ["b"], explicit_none: false },
      i3: { category_ids: ["c"], explicit_none: false },
    },
  ]);
  assert.equal(aggregate.counts.i1.a, 2);
  assert.equal(aggregate.counts.i1.b, 1);
  assert.equal(aggregate.counts.i3.none, 1);
});

test("resolution changes only the diagnostic classification and must actually differ", () => {
  const config = baseConfig("exclusive");
  const committed = exclusiveClassification("a", "b", "c");
  assert.equal(validateResolution(config, committed, "i2", { resolution_state: "keep_same" }).valid, true);
  assert.equal(validateResolution(config, committed, "i2", { resolution_state: "change_classification", revised: { category_ids: ["b"] } }).valid, false);
  assert.equal(validateResolution(config, committed, "i2", { resolution_state: "change_classification", revised: { category_ids: ["c"] } }).valid, true);
});

test("learner-safe activity config excludes guidance, resolution and lecturer internals", () => {
  const safe = learnerSafeConfig(baseConfig("exclusive"));
  assert.equal(safe.guidance, undefined);
  assert.equal(safe.resolution, undefined);
  assert.equal(safe.lecturer, undefined);
});

test("participant hashing is session-scoped and stable", () => {
  const a = hashParticipantToken("session-a", "token-123456");
  assert.equal(a, hashParticipantToken("session-a", "token-123456"));
  assert.notEqual(a, hashParticipantToken("session-b", "token-123456"));
  assert.equal(a.length, 64);
});
