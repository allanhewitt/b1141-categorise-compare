-- Run once against the b1141_categorise_compare database.
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  week INTEGER NOT NULL,
  activity TEXT NOT NULL,
  sequence INTEGER,
  prompt TEXT NOT NULL,
  items JSONB NOT NULL,        -- e.g. ["Competitive", "Commercial", ...]
  categories JSONB NOT NULL,   -- e.g. ["Positive", "Commercial", "Exclusive", ...]
  exclusive BOOLEAN NOT NULL DEFAULT true,  -- true = one category per item; false = many allowed
  reveal_mode TEXT NOT NULL DEFAULT 'threshold',
  reveal_threshold REAL,
  cohort_size INTEGER,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Event log, not a snapshot: every assign/unassign toggle gets its own row
-- when PERSIST_RESPONSES is on. assigned=true means this event added the
-- item-category pairing, assigned=false means it removed it. In exclusive
-- mode, moving an item to a new category logs a false event for the old
-- category and a true event for the new one, so the full history is
-- reconstructable without ambiguity. respondent_token is anonymous, same
-- convention as the other two repos.
CREATE TABLE IF NOT EXISTS responses (
  id SERIAL PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  respondent_token TEXT NOT NULL,
  item TEXT NOT NULL,
  category TEXT NOT NULL,
  assigned BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_responses_activity ON responses(activity_id);
CREATE INDEX IF NOT EXISTS idx_responses_token ON responses(activity_id, respondent_token);

-- Week One seed 1: "Three adjectives" (exclusive — one category per term)
-- Placeholder content — Allan intends to revise the actual terms later.
-- Changing them is a single UPDATE against this table, no redeploy.
INSERT INTO activities (
  id, module, week, activity, sequence,
  prompt, items, categories, exclusive,
  reveal_mode, reveal_threshold, cohort_size, active
) VALUES (
  'b1141-w1-three-adjectives', 'B1141', 1, 'three-adjectives', 1,
  'Sort each word into the category you think best fits how it describes sport.',
  '["Competitive", "Commercial", "Unifying", "Exclusive", "Corrupt", "Healthy"]'::jsonb,
  '["Positive", "Commercial", "Exclusive", "Political", "Other"]'::jsonb,
  true,
  'threshold', 0.8, 45, true
) ON CONFLICT (id) DO NOTHING;

-- Week One seed 2: "Language and assumptions" (non-exclusive — a term can
-- carry more than one assumption). Placeholder content, same as above.
INSERT INTO activities (
  id, module, week, activity, sequence,
  prompt, items, categories, exclusive,
  reveal_mode, reveal_threshold, cohort_size, active
) VALUES (
  'b1141-w1-language-assumptions', 'B1141', 1, 'language-assumptions', 4,
  'For each term, tag every category of assumption you think it carries. A term can carry more than one.',
  '["Natural athlete", "Aggressive", "Emotional", "Unladylike", "Inspirational"]'::jsonb,
  '["Gendered", "Racialised", "Ability-based", "Ambiguous"]'::jsonb,
  false,
  'threshold', 0.8, 45, true
) ON CONFLICT (id) DO NOTHING;
