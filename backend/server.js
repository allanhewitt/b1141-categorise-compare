import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

// --- CORS --- (same fix as the other two repos)
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

// --- In-memory live session store ---
// responses[token][item] = array of currently-assigned categories.
// Exclusive activities never hold more than one entry per item.
const sessionStore = new Map();

function getSession(id) {
  if (!sessionStore.has(id)) {
    sessionStore.set(id, { responses: {}, revealed: false });
  }
  return sessionStore.get(id);
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

// ---- Config: list ----
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

// ---- Config: single instance ----
app.get("/api/config/categorise/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.active) return res.status(410).json({ error: "Inactive" });
  res.json(serializeActivity(row));
});

// ---- Current state for one respondent (so a page reload restores their sort) ----
app.get("/api/response/categorise/:id/:token", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });
  const session = getSession(req.params.id);
  res.json(session.responses[req.params.token] || {});
});

// ---- Toggle an item-category assignment ----
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
  if (!session.responses[token]) session.responses[token] = {};
  const current = session.responses[token][item] || [];

  let updated;
  const events = [];

  if (row.exclusive) {
    if (current.includes(category)) {
      // clicking the already-assigned category unassigns it
      updated = [];
      events.push({ category, assigned: false });
    } else {
      const previous = current[0];
      updated = [category];
      if (previous) events.push({ category: previous, assigned: false });
      events.push({ category, assigned: true });
    }
  } else {
    if (current.includes(category)) {
      updated = current.filter((c) => c !== category);
      events.push({ category, assigned: false });
    } else {
      updated = [...current, category];
      events.push({ category, assigned: true });
    }
  }

  session.responses[token][item] = updated;

  if (PERSIST_RESPONSES) {
    for (const ev of events) {
      await pool.query(
        "INSERT INTO responses (activity_id, respondent_token, item, category, assigned) VALUES ($1, $2, $3, $4, $5)",
        [req.params.id, token, item, ev.category, ev.assigned]
      );
    }
  }

  res.json({ ok: true, current: updated });
});

// ---- Aggregate, grouped by category (matches the category-box view) ----
app.get("/api/aggregate/categorise/:id", async (req, res) => {
  const row = await findActivity(req.params.id);
  if (!row) return res.status(404).json({ error: "Unknown activity" });
  const session = getSession(req.params.id);

  // counts[category][item] = number of tokens currently assigning item -> category
  const counts = {};
  row.categories.forEach((cat) => {
    counts[cat] = {};
    row.items.forEach((item) => {
      counts[cat][item] = 0;
    });
  });

  const tokens = Object.keys(session.responses);
  let participantCount = 0;
  tokens.forEach((token) => {
    const itemMap = session.responses[token];
    const hasAny = Object.values(itemMap).some((cats) => cats.length > 0);
    if (hasAny) participantCount++;
    Object.entries(itemMap).forEach(([item, cats]) => {
      cats.forEach((cat) => {
        if (counts[cat] && counts[cat][item] !== undefined) counts[cat][item]++;
      });
    });
  });

  const thresholdMet =
    !!row.cohort_size &&
    participantCount / row.cohort_size >= (row.reveal_threshold ?? 1);

  let revealed = false;
  if (row.reveal_mode === "immediate") revealed = true;
  else if (row.reveal_mode === "threshold") revealed = thresholdMet || session.revealed;
  else if (row.reveal_mode === "manual") revealed = session.revealed;

  res.json({
    id: req.params.id,
    items: row.items,
    categories: row.categories,
    counts,
    total: participantCount,
    revealed,
    thresholdMet,
  });
});

// ---- Lecturer controls ----
app.post("/api/session/:id/reveal", (req, res) => {
  getSession(req.params.id).revealed = true;
  res.json({ ok: true });
});

app.post("/api/session/:id/clear", (req, res) => {
  sessionStore.set(req.params.id, { responses: {}, revealed: false });
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true, persisting: PERSIST_RESPONSES }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Categorise-compare API listening on :${PORT} (persist=${PERSIST_RESPONSES})`)
);
