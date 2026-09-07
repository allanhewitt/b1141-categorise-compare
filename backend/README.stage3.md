# C&C Stage 3 engine branch

This branch implements the approved Categorise & Compare Stage 1–2 contract behind an isolated Stage 3 server entry point.

## Safety boundary

- Legacy `npm start` remains `node server.js`.
- Stage 3 uses `npm run start:stage3` and requires `ENABLE_STAGE3_CANDC=true` plus a server-side `CANDC_LECTURER_KEY`.
- Migration `001_stage3_candc_architecture.sql` is additive and does not reclassify legacy activities.
- No production activation is implied by merging or testing this branch.

## Stage 3 semantic changes from legacy

- removes prediction-of-cohort from the model contract;
- persists classroom sessions and learner traces in PostgreSQL;
- hashes participant tokens per session before persistence;
- supports stable item/category IDs and contextualised item objects;
- distinguishes explicit-neutral responses from unanswered items;
- freezes the cohort reveal and diagnostic item;
- makes guidance configuration-driven and available only after reveal;
- restricts reconsideration to the selected diagnostic item;
- exposes response count but not distribution before reveal.

## Acceptance

Backend CI builds a fresh PostgreSQL database from `schema.sql` plus the manifested Stage 3 migration, runs pure domain tests and PostgreSQL-backed lifecycle tests, and audits production dependencies.
