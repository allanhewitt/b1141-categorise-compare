-- C&C Stage 3 additive architecture migration
-- 2026-09-01
-- Preserves all legacy columns/tables for rollback. No legacy activity is
-- silently reclassified as canonical C&C.

BEGIN;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS schema_version INTEGER;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_candc_stage3_contract;
ALTER TABLE activities ADD CONSTRAINT chk_candc_stage3_contract
CHECK (
  model IS DISTINCT FROM 'categorise_compare'
  OR (config IS NOT NULL AND schema_version IS NOT NULL AND schema_version > 0)
);

CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at TIMESTAMPTZ,
  diagnostic_item_id TEXT,
  reveal_snapshot JSONB,
  closed_at TIMESTAMPTZ,
  model_snapshot TEXT NOT NULL,
  config_snapshot JSONB NOT NULL,
  schema_version_snapshot INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_candc_session_temporal_order CHECK (
    (revealed_at IS NULL OR revealed_at >= opened_at)
    AND (closed_at IS NULL OR closed_at >= opened_at)
  ),
  CONSTRAINT chk_candc_reveal_snapshot CHECK (
    (revealed_at IS NULL AND reveal_snapshot IS NULL AND diagnostic_item_id IS NULL)
    OR (revealed_at IS NOT NULL AND reveal_snapshot IS NOT NULL AND diagnostic_item_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candc_one_open_session_per_activity
  ON activity_sessions(activity_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_candc_sessions_activity
  ON activity_sessions(activity_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS response_traces (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  participant_token_hash TEXT NOT NULL,
  working_classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  committed_classification JSONB,
  committed_at TIMESTAMPTZ,
  included_in_reveal BOOLEAN NOT NULL DEFAULT false,
  reveal_encountered_at TIMESTAMPTZ,
  guidance_reached_at TIMESTAMPTZ,
  resolution_state TEXT,
  revised_diagnostic_classification JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_candc_trace_session_participant UNIQUE(session_id, participant_token_hash),
  CONSTRAINT chk_candc_commit_consistency CHECK (
    (committed_at IS NULL AND committed_classification IS NULL)
    OR (committed_at IS NOT NULL AND committed_classification IS NOT NULL)
  ),
  CONSTRAINT chk_candc_reveal_membership CHECK (NOT included_in_reveal OR committed_at IS NOT NULL),
  CONSTRAINT chk_candc_trace_temporal_order CHECK (
    (reveal_encountered_at IS NULL OR committed_at IS NOT NULL)
    AND (guidance_reached_at IS NULL OR reveal_encountered_at IS NOT NULL)
    AND (completed_at IS NULL OR committed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_candc_traces_session ON response_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_candc_traces_committed ON response_traces(session_id, committed_at)
  WHERE committed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_model_active ON activities(model, active);
CREATE INDEX IF NOT EXISTS idx_activities_config_gin ON activities USING GIN(config);

COMMIT;
