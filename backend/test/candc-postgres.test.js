import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pg from "pg";
import { createStage3CandCRouter } from "../stage3-candc.js";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const lecturerKey = "stage3-candc-test-key-12345";
let pool;
let server;
let baseUrl;

function config(mode = "multi_tag", explicitNone = true) {
  return {
    entry: { text: "Read each case and sort it." },
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
      { id: "i2", content: "Case two", optional_context: { setting: "A match" }, display_order: 2 },
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
    guidance: { content: [{ type: "question", text: "What makes the difficult case hard to place?" }] },
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

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const body = await res.json();
  return { res, body };
}

async function putResponse(sessionId, token, itemId, categoryIds = [], explicitNone = false) {
  return request(`/api/candc/sessions/${sessionId}/response`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, item_id: itemId, category_ids: categoryIds, explicit_none: explicitNone }),
  });
}

async function commit(sessionId, token) {
  return request(`/api/candc/sessions/${sessionId}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

before(async () => {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
  pool = new Pool({ connectionString: databaseUrl });
  const app = express();
  app.use(express.json());
  app.use("/api/candc", createStage3CandCRouter({ pool, lecturerKey }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM response_traces");
  await pool.query("DELETE FROM activity_sessions");
  await pool.query("DELETE FROM activities WHERE id LIKE 'test-candc-%'");
});

async function insertActivity(id, cfg) {
  await pool.query(
    `INSERT INTO activities (
       id, module, week, activity, sequence, prompt, items, categories, exclusive,
       reveal_mode, reveal_threshold, cohort_size, active, model, title, config, schema_version
     ) VALUES ($1, 'TEST', 1, $2, 1, 'Legacy compatibility prompt', '[]'::jsonb, '[]'::jsonb, $3,
               'manual', NULL, NULL, true, 'categorise_compare', $4, $5::jsonb, 1)`,
    [id, id, cfg.classification.mode === "exclusive", "Test C&C", JSON.stringify(cfg)]
  );
}

test("multi-tag lifecycle persists complete-set commitment, hides distribution, reveals diagnostic item and resolves", async () => {
  const cfg = config("multi_tag", true);
  await insertActivity("test-candc-multi", cfg);

  let r = await request("/api/candc/activities/test-candc-multi/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GEDL-Lecturer-Key": lecturerKey },
    body: "{}",
  });
  assert.equal(r.res.status, 201);
  const sessionId = r.body.id;

  const tokenA = "participant-token-a-123";
  const tokenB = "participant-token-b-123";
  for (const [token, values] of [
    [tokenA, [["a", "b"], null, ["a"]]],
    [tokenB, [["a"], ["b"], ["c"]]],
  ]) {
    await putResponse(sessionId, token, "i1", values[0]);
    if (values[1] === null) await putResponse(sessionId, token, "i2", [], true);
    else await putResponse(sessionId, token, "i2", values[1]);
    await putResponse(sessionId, token, "i3", values[2]);
    r = await commit(sessionId, token);
    assert.equal(r.res.status, 200);
  }

  r = await request(`/api/candc/sessions/${sessionId}/aggregate`);
  assert.equal(r.body.response_count, 2);
  assert.equal(r.body.revealed, false);
  assert.equal(r.body.counts, undefined);

  r = await request(`/api/candc/sessions/${sessionId}/reveal`, {
    method: "POST",
    headers: { "X-GEDL-Lecturer-Key": lecturerKey },
  });
  assert.equal(r.res.status, 200);
  assert.ok(r.body.reveal.diagnostic_item_id);

  r = await request(`/api/candc/sessions/${sessionId}/aggregate`);
  assert.equal(r.body.revealed, true);
  assert.equal(r.body.participant_count, 2);
  assert.ok(r.body.counts.i2.none >= 1);
  const diagnosticId = r.body.diagnostic_item_id;

  r = await request(`/api/candc/sessions/${sessionId}/guidance?token=${encodeURIComponent(tokenA)}`);
  assert.equal(r.res.status, 200);
  assert.equal(r.body.item.id, diagnosticId);
  assert.equal(r.body.guidance[0].text, cfg.guidance.content[0].text);

  r = await request(`/api/candc/sessions/${sessionId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenA, resolution_state: "keep_same" }),
  });
  assert.equal(r.res.status, 200);

  const { rows } = await pool.query(
    "SELECT participant_token_hash, committed_classification, resolution_state, completed_at FROM response_traces WHERE session_id = $1 ORDER BY id",
    [sessionId]
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].participant_token_hash.length, 64);
  assert.notEqual(rows[0].participant_token_hash, tokenA);
  assert.ok(rows[0].committed_classification);
  assert.equal(rows[0].resolution_state, "keep_same");
  assert.ok(rows[0].completed_at);
});

test("exclusive resolution permits replacement on the frozen diagnostic item", async () => {
  const cfg = config("exclusive", false);
  await insertActivity("test-candc-exclusive", cfg);
  let r = await request("/api/candc/activities/test-candc-exclusive/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GEDL-Lecturer-Key": lecturerKey },
    body: "{}",
  });
  const sessionId = r.body.id;
  const token = "participant-exclusive-123";
  await putResponse(sessionId, token, "i1", ["a"]);
  await putResponse(sessionId, token, "i2", ["b"]);
  await putResponse(sessionId, token, "i3", ["c"]);
  await commit(sessionId, token);
  await request(`/api/candc/sessions/${sessionId}/reveal`, { method: "POST", headers: { "X-GEDL-Lecturer-Key": lecturerKey } });
  r = await request(`/api/candc/sessions/${sessionId}/aggregate`);
  const diagnostic = r.body.diagnostic_item_id;
  const me = await request(`/api/candc/sessions/${sessionId}/me?token=${encodeURIComponent(token)}`);
  const original = me.body.committed[diagnostic].category_ids[0];
  const replacement = ["a", "b", "c"].find((x) => x !== original);
  r = await request(`/api/candc/sessions/${sessionId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, resolution_state: "change_classification", revised: { category_ids: [replacement], explicit_none: false } }),
  });
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.body.revised.category_ids, [replacement]);
});
