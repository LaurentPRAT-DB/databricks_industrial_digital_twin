-- Lakebase Schema for Industrial Digital Twin
-- Idempotent — safe to run on every deploy.

CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config_yaml TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatifs (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    overrides JSONB NOT NULL DEFAULT '{}',
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL REFERENCES scenarios(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    report JSONB NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(scenario_id, slug)
);

CREATE TABLE IF NOT EXISTS simulation_ticks (
    id BIGSERIAL PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    whatif_name TEXT,
    tick_index INT NOT NULL,
    sim_time TEXT NOT NULL,
    elapsed_s FLOAT NOT NULL,
    entities JSONB NOT NULL,
    resources JSONB NOT NULL,
    metrics JSONB NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticks_scenario
    ON simulation_ticks(scenario_id, whatif_name, tick_index);

-- Allow any authenticated role (including app SP) to read/write
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
