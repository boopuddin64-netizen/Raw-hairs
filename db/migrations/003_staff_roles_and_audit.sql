-- Staff role model and audit trail.
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
-- Existing legacy admin accounts become managers; owner must be assigned explicitly.
UPDATE staff_users SET role = 'manager', updated_at = now() WHERE role = 'admin';

ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('owner','manager','operations','rider'));

-- Keep the original four-seat limit for privileged non-rider accounts.
CREATE OR REPLACE FUNCTION enforce_staff_seat_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE active_seats integer;
BEGIN
  PERFORM pg_advisory_xact_lock(740291);
  SELECT count(*) INTO active_seats
  FROM staff_users
  WHERE is_active AND role IN ('owner','manager','operations')
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF NEW.is_active AND NEW.role IN ('owner','manager','operations') AND active_seats >= 4 THEN
    RAISE EXCEPTION 'Maximum of four active privileged staff accounts reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS staff_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  target_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_access_events_created_at_idx ON staff_access_events(created_at DESC);
