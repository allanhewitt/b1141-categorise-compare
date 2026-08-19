import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

const rawOrigins = (process.env.ALLOWED_ORIGINS || "").trim();
const corsOrigin =
  rawOrigins === "*"
    ? "*"
    : rawOrigins === ""
    ? "*"
    : rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PERSIST_RESPONSES = process.env.PERSIST_RESPONSES === "true";

// Live state deliberately remains in memory. Committed classifications are
// frozen for the cohort reveal; later reconsideration never rewrites them.
const sessionStore = new Map();

function getSession(id) {
  if (!sessionStore.has(id)) {
    sessionStore.set(id, { respondents: {}, revealed: false });
  }
  return sessionStore.get(id);
}

function getRespondent(session, token) {
  if (!session.respondents[token]) {
    session.respondents[token] = {
      working: {},
      committed: null,
      prediction: [],
      revised: null,
      finalised: false,
    };
  }
  return session.respondents[token];
}

function cloneAssignments(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

async function findActivity(id) {
  const { rows } = await pool.query("SELECT * FROM activities WHERE id = $1", [id]);
  return rows[0] || null;
}

function serializeActivity(row) {
  return {
    id: row.id,
    module: row.module,
    week: row.week,
    activity: row.activity,
    sequence: row.sequence,
    prompt: row.prompt,
    items: row.items,
    categories: row.categories,
    exclusive: row.exclusive,
    reveal_mode: row.reveal_mode,
    reveal_threshold: row.reveal_threshold,
    cohort_size: row.cohort_size,
    active: row.active,
  };
}

function validComplete(row, assignments) {
  return row.items.every((item) => {
    const cats = assignments[item] || [];
    if (row.exclusive) return cats.length === 1;
    return cats.length >= 1;
  });
}

function updateAssignment(row, assignments, item, category) {
  const current = assignments[item] || [];
  const events = [];
  let updated;

  if (row.exclusive) {
    if (current.includes(category)) {
      updated = [];
      events.push({ category, assigned: false });
    } else {
      const previous = current[0];
      updated = [category];
      if (previous) events.push({ category: previous, assigned: false });
      events.push({ category, assigned: true });
    }
  } else if (current.includes(category)) {
    updated = current.filter((c) => c !== category);
    events.push({ category, assigned: false });
  } else {
    updated = [...current, category];
    events.push({ category, assigned: true });
  }

  return { updated, events };
}

function buildAggregate(row, session) {
  const counts = {};
  row.categories.forEach((cat) => {
    counts[cat] = {};
    row.items.forEach((item) => {
      counts[cat][item] = 0;
    });
  });

  const predictionCounts = {};
  row.items.forEach((item) => {
    predictionCounts[item] = 0;
  });

  const committedRespondents = Object.values(session.respondents).filter((r) => r.committed);
  committedRespondents.forEach((respondent) => {
    Object.entries(respondent.committed).forEach(([item, cats]) => {
      cats.forEach((cat) => {
        if (counts[cat] && counts[cat][item] !== undefined) counts[cat][item] += 1;
      });
    });
    respondent.prediction.forEach((item) => {
      if (predictionCounts[item] !== undefined) predictionCounts[item] += 1;
    });
  });

  const participantCount = committedRespondents.length;
  const divergence = {};

  row.items.forEach((item) => {
    if (!participantCount) {
      divergence[item] = 0;
      return;
    }

    if (row.exclusive) {
      const votes = row.categories.map((cat) => counts[cat][item] || 0);
      const totalVotes = votes.reduce((a, b) => a + b, 0);
      divergence[item] = totalVotes ? 1 - Math.max(...votes) / totalVotes : 0;
    } else {
      const splitScores = row.categories.map((cat) => {
        const p = (counts[cat][item] || 0) / participantCount;
        return 1 - Math.abs(2 * p - 1);
      });
      divergence[item] =
        splitScores.reduce((a, b) => a + b, 0) / Math.max(splitScores.length, 1);
    }
  });

  const mostDivisive = [...row.items]
    .sort((a, b) => divergence[b] - divergence[a])
    .slice(0, Math.min(2, row.items.length));

  const thresholdMet =
    !!row.cohort_size &&
    participantCount / row.cohort_size >= (row.reveal_threshold ?? 1);

  let globalRevealed = false;
  if (row.reveal_mode === "immediate") globalRevealed = true;
  else if (row.reveal_mode === "threshold") globalRevealed = thresholdMet || session.revealed;
  else if (row.reveal_mode === "manual") globalRevealed = session.revealed;

  return {
    counts,
    predictionCounts,
    divergence,
    mostDivisive,
    participantCount,
    thresholdMet,
    globalRevealed,
    reconsideredCount: committedRespondents.filter((r) => r.finalised).length,
  };
}

app.get("/api/config/categorise", async (req, res) => {
  const { module: mod, week, activity } = req.query;
  const clauses = [];
  const params = [];
  if (mod) {
    params.push(mod);
    clauses.push(`module = $${params.length}`);
  }
  if (week) {
    params.push(week);
    clauses.push(`week = $${params.length}`);
  }
  if (activity) {
    params.push(activity);
    clauses.push(`activity = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM activities ${where} ORDER BY week, sequence`,
    params
  );
  res.json(rows.map(serializeActivity));
});

app.get("/api/config/categorise/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.active) return res.status(410).json({ error: "Inactive" });
  res.json(serializeActivity(row));
});

app.get("/api/response/categorise/:id/:token", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });
  const session = getSession(req.params.id);
  res.json(getRespondent(session, req.params.token));
});

app.post("/api/response/categorise/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const { token, item, category } = req.body;
  if (typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }
  if (!row.items.includes(item)) {
    return res.status(400).json({ error: "Invalid item" });
  }
  if (!row.categories.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const session = getSession(req.params.id);
  const respondent = getRespondent(session, token);

  let phase = "initial";
  let target = respondent.working;

  if (respondent.committed) {
    const aggregate = buildAggregate(row, session);
    if (!aggregate.globalRevealed) {
      return res.status(409).json({ error: "Initial classification is locked until reveal" });
    }
    if (respondent.finalised) {
      return res.status(409).json({ error: "Reconsideration is already complete" });
    }
    if (!respondent.revised) respondent.revised = cloneAssignments(respondent.committed);
    target = respondent.revised;
    phase = "reconsideration";
  }

  const { updated, events } = updateAssignment(row, target, item, category);
  target[item] = updated;

  if (PERSIST_RESPONSES) {
    for (const ev of events) {
      await pool.query(
        "INSERT INTO responses (activity_id, respondent_token, item, category, assigned) VALUES ($1, $2, $3, $4, $5)",
        [req.params.id, `${token}:${phase}`, item, ev.category, ev.assigned]
      );
    }
  }

  res.json({ ok: true, respondent });
});

app.post("/api/response/categorise/:id/commit", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const { token } = req.body;
  if (typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }

  const session = getSession(req.params.id);
  const respondent = getRespondent(session, token);
  if (respondent.committed) return res.json({ ok: true, respondent });

  if (!validComplete(row, respondent.working)) {
    return res.status(400).json({ error: "Classify every case before locking your response" });
  }

  respondent.committed = cloneAssignments(respondent.working);
  respondent.revised = null;
  respondent.finalised = false;
  res.json({ ok: true, respondent });
});

app.post("/api/response/categorise/:id/prediction", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const { token, items } = req.body;
  if (typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 2) {
    return res.status(400).json({ error: "Choose one or two cases" });
  }
  if (items.some((item) => !row.items.includes(item))) {
    return res.status(400).json({ error: "Invalid prediction item" });
  }

  const session = getSession(req.params.id);
  const respondent = getRespondent(session, token);
  if (!respondent.committed) {
    return res.status(409).json({ error: "Lock your own classification first" });
  }
  if (buildAggregate(row, session).globalRevealed) {
    return res.status(409).json({ error: "Prediction must be made before the reveal" });
  }

  respondent.prediction = [...new Set(items)];
  res.json({ ok: true, respondent });
});

app.post("/api/response/categorise/:id/finalise", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const { token } = req.body;
  if (typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "Missing or invalid token" });
  }

  const session = getSession(req.params.id);
  const respondent = getRespondent(session, token);
  if (!respondent.committed) {
    return res.status(409).json({ error: "No committed classification" });
  }
  if (!buildAggregate(row, session).globalRevealed) {
    return res.status(409).json({ error: "Reconsideration is available after reveal" });
  }

  if (!respondent.revised) respondent.revised = cloneAssignments(respondent.committed);
  if (!validComplete(row, respondent.revised)) {
    return res.status(400).json({ error: "Every case must still have a category" });
  }
  respondent.finalised = true;
  res.json({ ok: true, respondent });
});

app.get("/api/aggregate/categorise/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });

  const session = getSession(req.params.id);
  const aggregate = buildAggregate(row, session);
  const token = typeof req.query.token === "string" ? req.query.token : null;
  const respondent = token ? session.respondents[token] : null;

  // Students only receive the class distribution once two conditions hold:
  // lecturer/threshold reveal AND the student's own divergence prediction.
  const studentEligible =
    !token || (aggregate.globalRevealed && !!respondent?.prediction?.length);

  res.json({
    id: req.params.id,
    items: row.items,
    categories: row.categories,
    total: aggregate.participantCount,
    revealed: token ? studentEligible : aggregate.globalRevealed,
    thresholdMet: aggregate.thresholdMet,
    counts: studentEligible ? aggregate.counts : null,
    predictionCounts: token && !studentEligible ? null : aggregate.predictionCounts,
    divergence: studentEligible ? aggregate.divergence : null,
    mostDivisive: studentEligible ? aggregate.mostDivisive : [],
    reconsideredCount: aggregate.reconsideredCount,
  });
});

app.post("/api/session/:id/reveal", (req, res) => {
  getSession(req.params.id).revealed = true;
  res.json({ ok: true });
});

app.post("/api/session/:id/clear", (req, res) => {
  sessionStore.set(req.params.id, { respondents: {}, revealed: false });
  res.json({ ok: true });
});

app.get("/api/health", (req, res) =>
  res.json({ ok: true, persisting: PERSIST_RESPONSES, interaction: "commit-predict-reveal-reconsider" })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Categorise-compare API listening on :${PORT} (persist=${PERSIST_RESPONSES})`)
);
