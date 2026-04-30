CREATE TYPE work_item_state AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');
CREATE TYPE priority AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE root_cause_category AS ENUM (
  'INFRASTRUCTURE',
  'APPLICATION',
  'NETWORK',
  'DATABASE',
  'CACHE',
  'HUMAN_ERROR',
  'THIRD_PARTY',
  'UNKNOWN'
);

CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  component_id VARCHAR(255) NOT NULL,
  state work_item_state NOT NULL DEFAULT 'OPEN',
  priority priority NOT NULL DEFAULT 'P2',
  title VARCHAR(500) NOT NULL,
  signal_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rca (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  incident_start TIMESTAMPTZ NOT NULL,
  incident_end TIMESTAMPTZ NOT NULL,
  root_cause_category root_cause_category NOT NULL,
  fix_applied TEXT NOT NULL,
  prevention_steps TEXT NOT NULL,
  mttr_seconds INT GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (incident_end - incident_start))::INT
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rca_work_item_unique ON rca(work_item_id);
CREATE INDEX IF NOT EXISTS work_items_component_id_idx ON work_items(component_id);
CREATE INDEX IF NOT EXISTS work_items_state_idx ON work_items(state);