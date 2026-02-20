-- Shift Aggregation System
-- Initial schema (PostgreSQL)

BEGIN;

CREATE TABLE employees (
  id BIGSERIAL PRIMARY KEY,
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  department VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_on DATE,
  left_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  google_sub VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'admin')),
  employee_id BIGINT UNIQUE REFERENCES employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shift_months (
  id BIGSERIAL PRIMARY KEY,
  year_month CHAR(7) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CHECK (start_date <= end_date)
);

CREATE TABLE shift_submissions (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  shift_month_id BIGINT NOT NULL REFERENCES shift_months(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  source VARCHAR(20) NOT NULL CHECK (source IN ('employee', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shift_submission_employee_month UNIQUE (employee_id, shift_month_id)
);

CREATE TABLE shift_submission_details (
  id BIGSERIAL PRIMARY KEY,
  shift_submission_id BIGINT NOT NULL REFERENCES shift_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  target_date DATE NOT NULL,
  availability VARCHAR(20) NOT NULL CHECK (availability IN ('available', 'unavailable', 'negotiable')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_submission_target_date UNIQUE (shift_submission_id, target_date)
);

CREATE TABLE sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  triggered_by_user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('auto', 'manual', 'retry')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
  spreadsheet_id VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE sync_job_items (
  id BIGSERIAL PRIMARY KEY,
  sync_job_id BIGINT NOT NULL REFERENCES sync_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  shift_submission_id BIGINT NOT NULL REFERENCES shift_submissions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sync_job_item UNIQUE (sync_job_id, shift_submission_id)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT,
  before_data JSONB,
  after_data JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_submissions_month_employee
  ON shift_submissions (shift_month_id, employee_id);

CREATE INDEX idx_shift_submission_details_target_date
  ON shift_submission_details (target_date);

CREATE INDEX idx_sync_jobs_status_created_at
  ON sync_jobs (status, created_at DESC);

CREATE INDEX idx_audit_logs_user_created_at
  ON audit_logs (user_id, created_at DESC);

CREATE INDEX idx_employees_is_active
  ON employees (is_active);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shift_months_updated_at
BEFORE UPDATE ON shift_months
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shift_submissions_updated_at
BEFORE UPDATE ON shift_submissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shift_submission_details_updated_at
BEFORE UPDATE ON shift_submission_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sync_jobs_updated_at
BEFORE UPDATE ON sync_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sync_job_items_updated_at
BEFORE UPDATE ON sync_job_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
