import { createHash, timingSafeEqual } from "node:crypto";

export const CANDC_MODEL = "categorise_compare";
export const CANDC_SCHEMA_VERSION = 1;

export class CandCConfigError extends Error {}

function fail(message) {
  throw new CandCConfigError(message);
}

function ordered(values = []) {
  return [...values].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

export function assertCandCConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("config must be an object");
  if (!config.entry || typeof config.entry.text !== "string") fail("entry.text is required");

  const c = config.classification;
  if (!c || !["exclusive", "multi_tag"].includes(c.mode)) fail("classification.mode must be exclusive or multi_tag");
  if (c.response_required_per_item !== true) fail("Stage 3 C&C requires response_required_per_item=true");

  const explicitNone = c.explicit_none || { enabled: false };
  if (typeof explicitNone.enabled !== "boolean") fail("explicit_none.enabled must be boolean");
  if (explicitNone.enabled) {
    if (typeof explicitNone.id !== "string" || !explicitNone.id) fail("explicit_none.id is required when enabled");
    if (typeof explicitNone.label !== "string" || !explicitNone.label) fail("explicit_none.label is required when enabled");
    if (explicitNone.mutually_exclusive_with_tags !== true) fail("explicit none must be mutually exclusive with tags");
  }

  if (!Array.isArray(config.items) || config.items.length < 2) fail("items must contain at least two entries");
  if (!Array.isArray(config.categories) || config.categories.length < 2) fail("categories must contain at least two entries");

  const itemIds = new Set();
  for (const item of config.items) {
    if (!item || typeof item.id !== "string" || !item.id) fail("every item requires an id");
    if (itemIds.has(item.id)) fail(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);
    if (typeof item.content !== "string" || !item.content) fail(`item ${item.id} requires content`);
    if (item.optional_context != null && (typeof item.optional_context !== "object" || Array.isArray(item.optional_context))) {
      fail(`item ${item.id} optional_context must be an object`);
    }
  }

  const categoryIds = new Set();
  for (const category of config.categories) {
    if (!category || typeof category.id !== "string" || !category.id) fail("every category requires an id");
    if (categoryIds.has(category.id)) fail(`duplicate category id: ${category.id}`);
    categoryIds.add(category.id);
    if (typeof category.label !== "string" || !category.label) fail(`category ${category.id} requires label`);
  }

  if (config.commitment?.submission_mode !== "batch" || config.commitment?.require_complete_set !== true) {
    fail("C&C Stage 3 requires batch complete-set commitment");
  }
  if (config.confrontation?.source !== "cohort_computational") fail("confrontation.source must be cohort_computational");
  if (!["lecturer_gated", "automatic"].includes(config.confrontation?.reveal_mode)) fail("invalid confrontation.reveal_mode");
  if (!["highest_divergence", "authored_item"].includes(config.confrontation?.diagnostic_rule)) fail("invalid confrontation.diagnostic_rule");
  if (!Array.isArray(config.guidance?.content) || config.guidance.content.length < 1) fail("guidance.content is required");
  if (config.resolution?.pattern !== "divergence") fail("resolution.pattern must be divergence");
  if (config.resolution?.allow_revision !== true) fail("resolution.allow_revision must be true");
  const expectedRevision = c.mode === "exclusive" ? "replace" : "edit_tag_set";
  if (config.resolution?.revision_mode !== expectedRevision) fail(`resolution.revision_mode must be ${expectedRevision}`);
  if (!Array.isArray(config.resolution?.options) || config.resolution.options.length < 2) fail("resolution.options are required");

  return true;
}

export function learnerSafeConfig(config) {
  assertCandCConfig(config);
  return {
    entry: config.entry,
    classification: config.classification,
    items: ordered(config.items),
    categories: ordered(config.categories),
    commitment: config.commitment,
  };
}

export function itemById(config, itemId) {
  return config.items.find((item) => item.id === itemId) || null;
}

export function categoryIds(config) {
  return new Set(config.categories.map((category) => category.id));
}

export function normalizeItemResponse(config, value = {}) {
  const ids = Array.isArray(value.category_ids) ? [...new Set(value.category_ids)] : [];
  return { category_ids: ids.sort(), explicit_none: Boolean(value.explicit_none) };
}

export function validateItemResponse(config, itemId, value) {
  assertCandCConfig(config);
  if (!itemById(config, itemId)) return { valid: false, errors: ["Unknown item"] };
  const response = normalizeItemResponse(config, value);
  const allowed = categoryIds(config);
  const errors = [];
  for (const id of response.category_ids) if (!allowed.has(id)) errors.push(`Unknown category: ${id}`);

  const explicitNone = config.classification.explicit_none || { enabled: false };
  if (response.explicit_none && !explicitNone.enabled) errors.push("Explicit-none response is not enabled");
  if (response.explicit_none && response.category_ids.length) errors.push("Explicit-none response cannot be combined with categories");

  if (config.classification.mode === "exclusive") {
    const n = response.category_ids.length + (response.explicit_none ? 1 : 0);
    if (n !== 1) errors.push("Choose exactly one classification");
  } else {
    if (!response.explicit_none) {
      const min = Number.isInteger(config.classification.min_tag_selections) ? config.classification.min_tag_selections : 1;
      const max = Number.isInteger(config.classification.max_tag_selections)
        ? config.classification.max_tag_selections
        : config.categories.length;
      if (response.category_ids.length < Math.max(1, min)) errors.push("Choose at least one tag or the explicit neutral response");
      if (response.category_ids.length > max) errors.push(`Choose no more than ${max} tags`);
    }
  }
  return { valid: errors.length === 0, errors, response };
}

export function validateCompleteClassification(config, classification = {}) {
  assertCandCConfig(config);
  const errors = [];
  const normalized = {};
  for (const item of ordered(config.items)) {
    const result = validateItemResponse(config, item.id, classification[item.id]);
    if (!result.valid) errors.push(`${item.id}: ${result.errors.join(", ")}`);
    else normalized[item.id] = result.response;
  }
  const extra = Object.keys(classification).filter((id) => !itemById(config, id));
  if (extra.length) errors.push(`Unknown item(s): ${extra.join(", ")}`);
  return { valid: errors.length === 0, errors, classification: normalized };
}

function responseStateIds(config, itemResponse) {
  const r = normalizeItemResponse(config, itemResponse);
  if (r.explicit_none) return [config.classification.explicit_none.id];
  return r.category_ids;
}

export function buildCohortAggregate(config, committedClassifications = []) {
  assertCandCConfig(config);
  const participantCount = committedClassifications.length;
  const stateIds = config.categories.map((c) => c.id);
  if (config.classification.explicit_none?.enabled) stateIds.push(config.classification.explicit_none.id);

  const counts = {};
  const divergence = {};
  for (const item of ordered(config.items)) {
    counts[item.id] = Object.fromEntries(stateIds.map((id) => [id, 0]));
    for (const classification of committedClassifications) {
      for (const id of responseStateIds(config, classification[item.id])) {
        if (Object.prototype.hasOwnProperty.call(counts[item.id], id)) counts[item.id][id] += 1;
      }
    }

    if (!participantCount) {
      divergence[item.id] = 0;
      continue;
    }
    if (config.classification.mode === "exclusive") {
      const values = stateIds.map((id) => counts[item.id][id]);
      divergence[item.id] = 1 - Math.max(...values) / participantCount;
    } else {
      const splitScores = stateIds.map((id) => {
        const p = counts[item.id][id] / participantCount;
        return 1 - Math.abs(2 * p - 1);
      });
      divergence[item.id] = splitScores.reduce((a, b) => a + b, 0) / splitScores.length;
    }
  }

  let diagnosticItemId = null;
  if (config.confrontation.diagnostic_rule === "authored_item") {
    diagnosticItemId = config.confrontation.diagnostic_item_id || null;
  } else {
    diagnosticItemId = ordered(config.items)
      .map((item) => item.id)
      .sort((a, b) => divergence[b] - divergence[a] || (itemById(config, a)?.display_order ?? 0) - (itemById(config, b)?.display_order ?? 0))[0] || null;
  }

  return { participant_count: participantCount, counts, divergence, diagnostic_item_id: diagnosticItemId };
}

export function publicReveal(config, aggregate) {
  return {
    participant_count: aggregate.participant_count,
    counts: aggregate.counts,
    divergence: aggregate.divergence,
    diagnostic_item_id: aggregate.diagnostic_item_id,
    diagnostic_item: aggregate.diagnostic_item_id ? itemById(config, aggregate.diagnostic_item_id) : null,
  };
}

export function validateResolution(config, committedClassification, diagnosticItemId, payload = {}) {
  assertCandCConfig(config);
  const optionIds = new Set(config.resolution.options.map((option) => option.id));
  const state = payload.resolution_state;
  if (!optionIds.has(state)) return { valid: false, errors: ["Invalid resolution state"] };
  const original = committedClassification?.[diagnosticItemId];
  if (!original) return { valid: false, errors: ["Original diagnostic classification is unavailable"] };

  const changeIds = new Set(["change_classification", "change_tagging", "change"]);
  if (!changeIds.has(state)) {
    return { valid: true, resolution_state: state, revised: normalizeItemResponse(config, original) };
  }
  const revisedCheck = validateItemResponse(config, diagnosticItemId, payload.revised);
  if (!revisedCheck.valid) return { valid: false, errors: revisedCheck.errors };
  const before = JSON.stringify(normalizeItemResponse(config, original));
  const after = JSON.stringify(revisedCheck.response);
  if (before === after) return { valid: false, errors: ["Changed classification must differ from the original"] };
  return { valid: true, resolution_state: state, revised: revisedCheck.response };
}

export function hashParticipantToken(sessionId, token) {
  return createHash("sha256").update(`${sessionId}:${token}`).digest("hex");
}

export function lecturerKeyMatches(expected, supplied) {
  if (typeof expected !== "string" || typeof supplied !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
