# b1141-categorise-compare

The `categorise-compare-divergence` GEDL model. Same conventions as the
other two repos: one repo, `/backend` + `/frontend`, HashRouter, the CORS
fix, Postgres for config and (optionally) persisted responses, anonymous
per-browser token.

## What's different from the other two repos

- **No submit step.** Students sort several items at once; each
  drag/tap syncs to the backend immediately. "All sorted" appears once
  every item has a category. Revising is just doing it again — nothing
  ever locks.
- **`exclusive` flag per activity** — `true` means one category per item
  (tapping a new category replaces the old one); `false` means an item
  can carry several categories at once (tapping toggles membership).
  Same schema and UI code handles both; only the config value changes.
- **Aggregate view is category boxes, not a bar chart or heatmap** — one
  box per category, listing which items landed there and how many times,
  mirroring the sort buckets themselves. An item scattered across several
  boxes is the divergence signal; an item piled into one box is
  agreement.
- **Event-log persistence, not snapshots** — when `PERSIST_RESPONSES` is
  on, every assign/unassign is its own row (`assigned: true/false`), so
  the full history of how someone's sort evolved is reconstructable, not
  just the final state.

## Structure

```
backend/
  server.js
  schema.sql        creates tables, seeds two Week One instances
frontend/
  src/
    Respond.jsx      /#/respond/{id} — the sort itself
    Control.jsx      /#/control/{id} — category boxes, reveal/clear
    CategoryBoxes.jsx shared aggregate view
```

## Week One seed content (placeholder — intended to be revised)

Two instances, both under module B1141, week 1:

- `b1141-w1-three-adjectives` — exclusive, six candidate words, five
  categories (Positive / Commercial / Exclusive / Political / Other)
- `b1141-w1-language-assumptions` — non-exclusive, five terms, four
  categories (Gendered / Racialised / Ability-based / Ambiguous)

Both are placeholder wording. Changing the actual words is a plain
`UPDATE` against the `items` and/or `categories` JSONB columns — no
redeploy needed, e.g.:

```sql
UPDATE activities
SET items = '["Word one", "Word two", ...]'::jsonb
WHERE id = 'b1141-w1-three-adjectives';
```

## Setting up the database

```sql
CREATE DATABASE b1141_categorise_compare;
```

Then, connected to that database, run `backend/schema.sql` in full.

## Routes

- `/#/respond/{id}`
- `/#/control/{id}`

## Deploying to Coolify

Identical steps to the other two repos: push to GitHub, create the
database and run the schema, deploy `/backend` (port 4000, not static)
then `/frontend` (port 80, static site ticked, `VITE_API_BASE` set at
buildtime to the backend's deployed URL).
