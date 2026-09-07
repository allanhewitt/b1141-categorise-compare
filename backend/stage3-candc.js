import express from "express";
import { randomUUID } from "node:crypto";
import {
  CANDC_MODEL,
  assertCandCConfig,
  buildCohortAggregate,
  hashParticipantToken,
  learnerSafeConfig,
  lecturerKeyMatches,
  publicReveal,
  validateCompleteClassification,
  validateItemResponse,
  validateResolution,
} from "./lib/candc.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadActivity(db, id, { requireActive = true, lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, module, week, activity, sequence, title, model, config, schema_version, active
       FROM activities
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}`,
    [id]
  );
  const row = rows[0] || null;
  if (!row) return { error: "not_found" };
  if (row.model !== CANDC_MODEL) return { error: "wrong_model" };
  if (requireActive && !row.active) return { error: "inactive" };
  assertCandCConfig(row.config);
  return { row };
}

async function loadSession(db, id, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT s.*, a.title, a.active AS activity_active
       FROM activity_sessions s
       JOIN activities a ON a.id = s.activity_id
      WHERE s.id = $1
      ${lock ? "FOR UPDATE OF s" : ""}`,
    [id]
  );
  const row = rows[0] || null;
  if (row) assertCandCConfig(row.config_snapshot);
  return row;
}

function sessionState(session) {
  return {
    id: session.id,
    activity_id: session.activity_id,
    opened_at: session.opened_at,
    revealed: Boolean(session.revealed_at),
    diagnostic_item_id: session.diagnostic_item_id,
    closed: Boolean(session.closed_at),
  };
}

function requireLecturer(lecturerKey) {
  return (req, res, next) => {
    if (!lecturerKeyMatches(lecturerKey, req.get("X-GEDL-Lecturer-Key"))) {
      return res.status(401).json({ error: "Lecturer authorisation required" });
    }
    next();
  };
}

function tokenFrom(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 512) {
    const error = new Error("Missing or invalid token");
    error.status = 400;
    throw error;
  }
  return value;
}

async function responseCount(db, sessionId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM response_traces
      WHERE session_id = $1
        AND committed_at IS NOT NULL`,
    [sessionId]
  );
  return rows[0]?.count ?? 0;
}

async function getTrace(db, sessionId, participantHash, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM response_traces
      WHERE session_id = $1 AND participant_token_hash = $2
      ${lock ? "FOR UPDATE" : ""}`,
    [sessionId, participantHash]
  );
  return rows[0] || null;
}

async function freezeReveal(db, session) {
  if (session.revealed_at) return session;
  if (session.closed_at) {
    const error = new Error("Session is closed");
    error.status = 409;
    throw error;
  }

  const traces = await db.query(
    `SELECT id, committed_classification
       FROM response_traces
      WHERE session_id = $1
        AND committed_at IS NOT NULL
      ORDER BY id
      FOR UPDATE`,
    [session.id]
  );
  const committed = traces.rows.map((row) => row.committed_classification);
  const aggregate = buildCohortAggregate(session.config_snapshot, committed);
  const now = new Date();

  await db.query(
    `UPDATE response_traces
        SET included_in_reveal = true,
            updated_at = $2
      WHERE session_id = $1
        AND committed_at IS NOT NULL`,
    [session.id, now]
  );

  const { rows } = await db.query(
    `UPDATE activity_sessions
        SET revealed_at = $2,
            diagnostic_item_id = $3,
            reveal_snapshot = $4::jsonb,
            updated_at = $2
      WHERE id = $1
      RETURNING *`,
    [session.id, now, aggregate.diagnostic_item_id, JSON.stringify(aggregate)]
  );
  return { ...session, ...rows[0] };
}

export function createStage3CandCRouter({ pool, lecturerKey }) {
  if (!pool) throw new Error("Stage 3 C&C router requires a PostgreSQL pool");
  if (typeof lecturerKey !== "string" || lecturerKey.length < 16) {
    throw new Error("ENABLE_STAGE3_CANDC requires CANDC_LECTURER_KEY of at least 16 characters");
  }

  const router = express.Router();
  const lecturerOnly = requireLecturer(lecturerKey);

  router.get("/activities/:id", asyncRoute(async (req, res) => {
    const result = await loadActivity(pool, req.params.id);
    if (result.error === "not_found") return res.status(404).json({ error: "Unknown activity" });
    if (result.error === "wrong_model") return res.status(409).json({ error: "Activity is not a C&C activity" });
    if (result.error === "inactive") return res.status(410).json({ error: "Inactive" });
    res.json({ id: result.row.id, title: result.row.title, schema_version: result.row.schema_version, config: learnerSafeConfig(result.row.config) });
  }));

  router.get("/activities/:id/session", asyncRoute(async (req, res) => {
    const activity = await loadActivity(pool, req.params.id);
    if (activity.error === "not_found") return res.status(404).json({ error: "Unknown activity" });
    if (activity.error === "wrong_model") return res.status(409).json({ error: "Activity is not a C&C activity" });
    if (activity.error === "inactive") return res.status(410).json({ error: "Inactive" });
    const { rows } = await pool.query(
      `SELECT * FROM activity_sessions WHERE activity_id = $1 AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "No open session" });
    res.json(sessionState(rows[0]));
  }));

  router.post("/activities/:id/sessions", lecturerOnly, asyncRoute(async (req, res) => {
    const result = await withTransaction(pool, async (client) => {
      const activity = await loadActivity(client, req.params.id, { lock: true });
      if (activity.error) return { activityError: activity.error };
      const existing = await client.query(
        `SELECT * FROM activity_sessions WHERE activity_id = $1 AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
        [req.params.id]
      );
      if (existing.rows[0]) return { session: existing.rows[0], created: false };
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO activity_sessions (id, activity_id, model_snapshot, config_snapshot, schema_version_snapshot)
         VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
        [id, activity.row.id, activity.row.model, JSON.stringify(activity.row.config), activity.row.schema_version]
      );
      return { session: inserted.rows[0], created: true };
    });
    if (result.activityError === "not_found") return res.status(404).json({ error: "Unknown activity" });
    if (result.activityError === "wrong_model") return res.status(409).json({ error: "Activity is not a C&C activity" });
    if (result.activityError === "inactive") return res.status(410).json({ error: "Inactive" });
    res.status(result.created ? 201 : 200).json({ ...sessionState(result.session), created: result.created });
  }));

  router.get("/sessions/:sessionId/state", asyncRoute(async (req, res) => {
    const session = await loadSession(pool, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Unknown session" });
    res.json(sessionState(session));
  }));

  router.get("/sessions/:sessionId/me", asyncRoute(async (req, res) => {
    const session = await loadSession(pool, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Unknown session" });
    const token = tokenFrom(req.query.token);
    const hash = hashParticipantToken(session.id, token);
    const trace = await getTrace(pool, session.id, hash);
    res.json({
      session: sessionState(session),
      working: trace?.working_classification || {},
      committed: trace?.committed_classification || null,
      included_in_reveal: Boolean(trace?.included_in_reveal),
      reveal_encountered: Boolean(trace?.reveal_encountered_at),
      guidance_reached: Boolean(trace?.guidance_reached_at),
      resolution_state: trace?.resolution_state || null,
      revised_diagnostic: trace?.revised_diagnostic_classification || null,
      completed: Boolean(trace?.completed_at),
    });
  }));

  router.put("/sessions/:sessionId/response", asyncRoute(async (req, res) => {
    const token = tokenFrom(req.body?.token);
    const result = await withTransaction(pool, async (client) => {
      const session = await loadSession(client, req.params.sessionId, { lock: true });
      if (!session) return { notFound: true };
      if (session.closed_at) return { conflict: "Session is closed" };
      const hash = hashParticipantToken(session.id, token);
      const trace = await getTrace(client, session.id, hash, { lock: true });
      if (trace?.committed_at) return { conflict: "Your initial classification is already committed" };
      if (session.revealed_at) return { conflict: "The group responses have already been shown" };
      const check = validateItemResponse(session.config_snapshot, req.body?.item_id, { category_ids: req.body?.category_ids, explicit_none: req.body?.explicit_none });
      if (!check.valid) return { badRequest: check.errors.join("; ") };
      const working = { ...(trace?.working_classification || {}) };
      working[req.body.item_id] = check.response;
      const { rows } = await client.query(
        `INSERT INTO response_traces (session_id, participant_token_hash, working_classification)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (session_id, participant_token_hash)
         DO UPDATE SET working_classification = EXCLUDED.working_classification, updated_at = now()
         WHERE response_traces.committed_at IS NULL
         RETURNING *`,
        [session.id, hash, JSON.stringify(working)]
      );
      if (!rows[0]) return { conflict: "Your initial classification is already committed" };
      return { working };
    });
    if (result.notFound) return res.status(404).json({ error: "Unknown session" });
    if (result.badRequest) return res.status(400).json({ error: result.badRequest });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    res.json({ ok: true, working: result.working });
  }));

  router.post("/sessions/:sessionId/commit", asyncRoute(async (req, res) => {
    const token = tokenFrom(req.body?.token);
    const result = await withTransaction(pool, async (client) => {
      const session = await loadSession(client, req.params.sessionId, { lock: true });
      if (!session) return { notFound: true };
      if (session.closed_at) return { conflict: "Session is closed" };
      const hash = hashParticipantToken(session.id, token);
      const trace = await getTrace(client, session.id, hash, { lock: true });
      if (!trace) return { badRequest: "Classify every item before submitting" };
      if (trace.committed_at) return { already: true };
      if (session.revealed_at) return { conflict: "The group responses have already been shown" };
      const check = validateCompleteClassification(session.config_snapshot, trace.working_classification);
      if (!check.valid) return { badRequest: check.errors.join("; ") };
      const now = new Date();
      await client.query(
        `UPDATE response_traces SET committed_classification = $3::jsonb, committed_at = $4, updated_at = $4
          WHERE session_id = $1 AND participant_token_hash = $2`,
        [session.id, hash, JSON.stringify(check.classification), now]
      );
      return { count: await responseCount(client, session.id) };
    });
    if (result.notFound) return res.status(404).json({ error: "Unknown session" });
    if (result.badRequest) return res.status(400).json({ error: result.badRequest });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    if (result.already) return res.json({ ok: true, already_committed: true });
    res.json({ ok: true, committed: true, response_count: result.count });
  }));

  router.get("/sessions/:sessionId/aggregate", asyncRoute(async (req, res) => {
    const session = await loadSession(pool, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Unknown session" });
    const count = await responseCount(pool, session.id);
    if (!session.revealed_at) return res.json({ response_count: count, revealed: false });
    res.json({ response_count: count, revealed: true, ...publicReveal(session.config_snapshot, session.reveal_snapshot) });
  }));

  router.post("/sessions/:sessionId/reveal", lecturerOnly, asyncRoute(async (req, res) => {
    const result = await withTransaction(pool, async (client) => {
      const session = await loadSession(client, req.params.sessionId, { lock: true });
      if (!session) return { notFound: true };
      const revealed = await freezeReveal(client, session);
      return { session: revealed };
    });
    if (result.notFound) return res.status(404).json({ error: "Unknown session" });
    res.json({ ok: true, ...sessionState(result.session), reveal: publicReveal(result.session.config_snapshot, result.session.reveal_snapshot) });
  }));

  router.get("/sessions/:sessionId/guidance", asyncRoute(async (req, res) => {
    const token = tokenFrom(req.query.token);
    const result = await withTransaction(pool, async (client) => {
      const session = await loadSession(client, req.params.sessionId, { lock: true });
      if (!session) return { notFound: true };
      if (!session.revealed_at) return { conflict: "Group responses are not available yet" };
      const hash = hashParticipantToken(session.id, token);
      const trace = await getTrace(client, session.id, hash, { lock: true });
      if (!trace?.committed_at) return { conflict: "No committed classification" };
      const now = new Date();
      await client.query(
        `UPDATE response_traces
            SET reveal_encountered_at = COALESCE(reveal_encountered_at, $3), guidance_reached_at = COALESCE(guidance_reached_at, $3), updated_at = $3
          WHERE session_id = $1 AND participant_token_hash = $2`,
        [session.id, hash, now]
      );
      return {
        item: session.config_snapshot.items.find((item) => item.id === session.diagnostic_item_id) || null,
        original: trace.committed_classification?.[session.diagnostic_item_id] || null,
        guidance: session.config_snapshot.guidance.content,
        resolution: session.config_snapshot.resolution,
      };
    });
    if (result.notFound) return res.status(404).json({ error: "Unknown session" });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    res.json(result);
  }));

  router.post("/sessions/:sessionId/resolve", asyncRoute(async (req, res) => {
    const token = tokenFrom(req.body?.token);
    const result = await withTransaction(pool, async (client) => {
      const session = await loadSession(client, req.params.sessionId, { lock: true });
      if (!session) return { notFound: true };
      if (!session.revealed_at) return { conflict: "Group responses are not available yet" };
      if (session.closed_at) return { conflict: "Session is closed" };
      const hash = hashParticipantToken(session.id, token);
      const trace = await getTrace(client, session.id, hash, { lock: true });
      if (!trace?.committed_at) return { conflict: "No committed classification" };
      if (trace.completed_at) return { conflict: "This activity is already complete" };
      const check = validateResolution(session.config_snapshot, trace.committed_classification, session.diagnostic_item_id, { resolution_state: req.body?.resolution_state, revised: req.body?.revised });
      if (!check.valid) return { badRequest: check.errors.join("; ") };
      const now = new Date();
      await client.query(
        `UPDATE response_traces
            SET reveal_encountered_at = COALESCE(reveal_encountered_at, $3), guidance_reached_at = COALESCE(guidance_reached_at, $3),
                resolution_state = $4, revised_diagnostic_classification = $5::jsonb, completed_at = $3, updated_at = $3
          WHERE session_id = $1 AND participant_token_hash = $2`,
        [session.id, hash, now, check.resolution_state, JSON.stringify(check.revised)]
      );
      return { revised: check.revised, resolution_state: check.resolution_state };
    });
    if (result.notFound) return res.status(404).json({ error: "Unknown session" });
    if (result.badRequest) return res.status(400).json({ error: result.badRequest });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    res.json({ ok: true, ...result });
  }));

  router.post("/sessions/:sessionId/close", lecturerOnly, asyncRoute(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE activity_sessions SET closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.sessionId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Unknown session" });
    res.json({ ok: true, ...sessionState(rows[0]) });
  }));

  return router;
}
