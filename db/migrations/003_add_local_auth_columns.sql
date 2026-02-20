BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'google';

UPDATE users
SET auth_provider = 'google'
WHERE auth_provider IS NULL;

COMMIT;
