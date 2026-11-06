-- RAW HAIRS migration 003: first-party server-managed authentication.
-- No Firebase Web API key is used by the browser after this migration.
-- Apply to the isolated development database first; do not apply to production
-- without explicit owner approval and a staff-account migration plan.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  display_name text,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (password_hash IS NULL OR password_hash LIKE 'scrypt:%')
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth_users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_auth_user_id_uidx
  ON customers(auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth_users(id) ON DELETE RESTRICT;
ALTER TABLE staff_users ALTER COLUMN firebase_uid DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_auth_user_id_uidx
  ON staff_users(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_key text NOT NULL,
  ip_key char(64) NOT NULL,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email_key, ip_key)
);
CREATE INDEX IF NOT EXISTS auth_login_attempts_blocked_idx
  ON auth_login_attempts(blocked_until) WHERE blocked_until IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('003_server_managed_auth')
ON CONFLICT (version) DO NOTHING;

COMMIT;
