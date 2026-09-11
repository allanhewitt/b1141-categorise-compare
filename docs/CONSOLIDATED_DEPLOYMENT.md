# Consolidated C&C deployment

The production target is one Coolify application serving both the React frontend and the Express API from a single origin.

## Build

Use the repository-root `Dockerfile`.

The image:

1. builds `frontend/` with Vite;
2. installs production dependencies from `backend/`;
3. copies the Vite build into `/app/frontend-dist`;
4. starts `backend/server-stage3.js`, which serves both `/api/*` and the SPA.

## Required environment

- `DATABASE_URL`
- `ENABLE_STAGE3_CANDC=true`
- `CANDC_LECTURER_KEY` (minimum 16 characters)
- `PORT=4000` unless the platform supplies its own port

`VITE_API_BASE` is no longer required for the consolidated production deployment. It remains supported as a transition/development override for the older split frontend/backend deployment.

## Routes

The same public host serves:

- student aliases such as `/cc01`;
- lecturer views such as `/stage3/control/<activity-id>`;
- presentation views such as `/stage3/display/<activity-id>`;
- API routes under `/api/candc/*`;
- health at `/api/health`.

## Transition

Keep the existing split frontend/backend services available until the consolidated service has passed live smoke testing. Do not remove or repoint the current production services until the new single application has been verified against the production PostgreSQL database.

## CC01 production content

`backend/migrations/005_cc01_sequential_reference_revision.sql` applies the accepted Week 1 CC01 ordering, wording and guidance. It preserves the activity activation flag and does not modify historical session snapshots.
