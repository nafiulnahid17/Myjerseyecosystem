CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('standard', 'fast')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 6),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL,
  front_ready INTEGER NOT NULL DEFAULT 0 CHECK (front_ready IN (0, 1)),
  back_ready INTEGER NOT NULL DEFAULT 0 CHECK (back_ready IN (0, 1)),
  report TEXT,
  error TEXT
);
CREATE INDEX jobs_owner_created ON jobs(owner, created_at DESC);
CREATE INDEX jobs_owner_status ON jobs(owner, status);
CREATE TABLE job_events (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('running', 'complete', 'failed')),
  message TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (job_id, step, phase)
);
CREATE TABLE provider_files (
  cache_key TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
