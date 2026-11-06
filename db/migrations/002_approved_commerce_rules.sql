-- RAW HAIRS migration 002: approved commerce and fulfilment rules.
-- Apply ONLY to an isolated development Neon branch after reviewing the diff.
-- Never apply this migration to production without explicit owner approval.
-- Amounts are NGN kobo. Delivery evidence stores private object keys, never public URLs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Staff roles: owner + one manager initially; operations is reserved for later.
-- Preserve existing admin accounts by mapping the legacy role to manager.
-- ---------------------------------------------------------------------------
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
UPDATE staff_users SET role = 'manager' WHERE role = 'admin';
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('owner','manager','operations','rider'));

CREATE OR REPLACE FUNCTION enforce_staff_seat_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE owner_seats integer;
DECLARE manager_seats integer;
BEGIN
  PERFORM pg_advisory_xact_lock(740291);
  SELECT count(*) FILTER (WHERE role = 'owner'),
         count(*) FILTER (WHERE role = 'manager')
    INTO owner_seats, manager_seats
  FROM staff_users
  WHERE is_active
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NEW.is_active AND NEW.role = 'owner' AND owner_seats >= 1 THEN
    RAISE EXCEPTION 'Only one active RAW HAIRS owner account is permitted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_active AND NEW.role = 'manager' AND manager_seats >= 1 THEN
    RAISE EXCEPTION 'Only one active RAW HAIRS manager account is permitted'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Delivery zones and restricted cash-on-delivery eligibility.
-- COD requires BOTH an enabled zone and an individually approved customer.
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'NG',
  state_name text,
  city text,
  fee_kobo bigint NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  cod_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, state_name, city, name)
);

CREATE TABLE customer_cod_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  approved_by uuid NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (customer_id),
  CHECK ((is_active AND revoked_at IS NULL) OR (NOT is_active))
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('paystack','manual_transfer','cash_on_delivery')),
  ADD COLUMN IF NOT EXISTS cod_eligibility_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cod_approved_at timestamptz;

CREATE INDEX delivery_zones_active_idx ON delivery_zones(is_active, country_code, state_name, city);
CREATE INDEX customer_cod_approvals_active_idx ON customer_cod_approvals(customer_id) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Fifteen-minute inventory reservations. The reservation header and item rows
-- are the durable audit record; inventory_balances.reserved remains authoritative.
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_key text NOT NULL UNIQUE,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','consumed','expired','released')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE (reservation_id, variant_id)
);

CREATE INDEX inventory_reservations_expiry_idx
  ON inventory_reservations(expires_at) WHERE status = 'active';
CREATE INDEX inventory_reservation_items_variant_idx
  ON inventory_reservation_items(variant_id);

-- Atomically reserves every requested variant. The caller should pass a JSON
-- array of { "variant_id": "<uuid>", "quantity": <positive integer> }.
-- Any unavailable item raises an exception and rolls back the entire reservation.
CREATE OR REPLACE FUNCTION create_inventory_reservation(
  p_checkout_key text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  reservation_id uuid;
  item record;
  balance_row record;
BEGIN
  IF p_checkout_key IS NULL OR length(trim(p_checkout_key)) < 16 THEN
    RAISE EXCEPTION 'A high-entropy checkout key is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one inventory item is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Idempotent retry: an existing live reservation is returned unchanged.
  PERFORM pg_advisory_xact_lock(hashtext(p_checkout_key));
  SELECT id INTO reservation_id
  FROM inventory_reservations
  WHERE checkout_key = p_checkout_key
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;
  IF reservation_id IS NOT NULL THEN
    RETURN reservation_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(variant_id uuid, quantity integer)
    WHERE variant_id IS NULL OR quantity IS NULL OR quantity <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid variant or quantity in reservation request'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock balances in stable UUID order to reduce deadlock risk.
  FOR item IN
    SELECT x.variant_id, sum(x.quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(variant_id uuid, quantity integer)
    GROUP BY x.variant_id
    ORDER BY x.variant_id
  LOOP
    SELECT on_hand, reserved INTO balance_row
    FROM inventory_balances
    WHERE variant_id = item.variant_id
    FOR UPDATE;

    IF NOT FOUND OR balance_row.on_hand - balance_row.reserved < item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %', item.variant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  INSERT INTO inventory_reservations(checkout_key, expires_at)
  VALUES (p_checkout_key, now() + interval '15 minutes')
  RETURNING id INTO reservation_id;

  FOR item IN
    SELECT x.variant_id, sum(x.quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(variant_id uuid, quantity integer)
    GROUP BY x.variant_id
    ORDER BY x.variant_id
  LOOP
    UPDATE inventory_balances
    SET reserved = reserved + item.quantity, updated_at = now()
    WHERE variant_id = item.variant_id;

    INSERT INTO inventory_reservation_items(reservation_id, variant_id, quantity)
    VALUES (reservation_id, item.variant_id, item.quantity);

    INSERT INTO inventory_movements(
      variant_id, movement_type, quantity_delta, reference_type,
      reference_id, reason, actor_uid
    ) VALUES (
      item.variant_id, 'reservation', item.quantity, 'inventory_reservation',
      reservation_id, '15-minute checkout stock reservation', 'system'
    );
  END LOOP;

  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_expired_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE reservation_row record;
DECLARE item record;
DECLARE released_count integer := 0;
BEGIN
  FOR reservation_row IN
    SELECT id
    FROM inventory_reservations
    WHERE status = 'active' AND expires_at <= now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    FOR item IN
      SELECT variant_id, quantity
      FROM inventory_reservation_items
      WHERE reservation_id = reservation_row.id
      ORDER BY variant_id
    LOOP
      UPDATE inventory_balances
      SET reserved = reserved - item.quantity, updated_at = now()
      WHERE variant_id = item.variant_id;

      INSERT INTO inventory_movements(
        variant_id, movement_type, quantity_delta, reference_type,
        reference_id, reason, actor_uid
      ) VALUES (
        item.variant_id, 'reservation_release', -item.quantity,
        'inventory_reservation', reservation_row.id,
        '15-minute checkout reservation expired', 'system'
      );
    END LOOP;

    UPDATE inventory_reservations
    SET status = 'expired', released_at = now()
    WHERE id = reservation_row.id AND status = 'active';
    released_count := released_count + 1;
  END LOOP;
  RETURN released_count;
END;
$$;

-- Convert a live reservation into a sale exactly once after verified payment
-- or an approved COD/manual-transfer fulfilment transition.
CREATE OR REPLACE FUNCTION consume_inventory_reservation(
  p_reservation_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE reservation_row record;
DECLARE item record;
BEGIN
  SELECT id, status, expires_at INTO reservation_row
  FROM inventory_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory reservation not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF reservation_row.status = 'consumed' THEN
    RETURN false;
  END IF;
  IF reservation_row.status <> 'active' OR reservation_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Inventory reservation is no longer active'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR item IN
    SELECT variant_id, quantity
    FROM inventory_reservation_items
    WHERE reservation_id = p_reservation_id
    ORDER BY variant_id
  LOOP
    UPDATE inventory_balances
    SET on_hand = on_hand - item.quantity,
        reserved = reserved - item.quantity,
        updated_at = now()
    WHERE variant_id = item.variant_id
      AND on_hand >= item.quantity
      AND reserved >= item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory balance changed before reservation consumption'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO inventory_movements(
      variant_id, movement_type, quantity_delta, reference_type,
      reference_id, reason, actor_uid
    ) VALUES (
      item.variant_id, 'sale', -item.quantity, 'order',
      p_order_id, 'Reserved stock consumed for confirmed order', 'system'
    );
  END LOOP;

  UPDATE inventory_reservations
  SET status = 'consumed', order_id = p_order_id, consumed_at = now()
  WHERE id = p_reservation_id AND status = 'active';

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Delivery proof: private object keys only. Evidence expires after 90 days.
-- OTP hash remains on delivery_jobs; raw OTP must never be stored.
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz;

CREATE TABLE delivery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id uuid NOT NULL REFERENCES delivery_jobs(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL DEFAULT 'delivery_photo'
    CHECK (evidence_type IN ('delivery_photo')),
  private_storage_key text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  sha256_hex char(64) NOT NULL,
  uploaded_by_uid text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  storage_deleted_at timestamptz,
  CHECK (expires_at >= uploaded_at)
);

CREATE INDEX delivery_evidence_expiry_idx
  ON delivery_evidence(expires_at) WHERE storage_deleted_at IS NULL;
CREATE INDEX delivery_evidence_job_idx
  ON delivery_evidence(delivery_job_id, uploaded_at DESC);

-- The order may be marked customer-confirmed only after OTP verification and
-- at least one uploaded private delivery photograph are both present.
CREATE OR REPLACE FUNCTION enforce_delivery_confirmation_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL OR NEW.customer_confirmed_at IS NOT NULL THEN
    IF NEW.otp_verified_at IS NULL THEN
      RAISE EXCEPTION 'Customer OTP verification is required to confirm delivery'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM delivery_evidence
      WHERE delivery_job_id = NEW.id AND evidence_type = 'delivery_photo'
        AND storage_deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Delivery photo proof is required to confirm delivery'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
    NEW.customer_confirmed_at := COALESCE(NEW.customer_confirmed_at, NEW.confirmed_at);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_confirmation_requires_proof
BEFORE UPDATE OF confirmed_at, customer_confirmed_at ON delivery_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_delivery_confirmation_evidence();

-- ---------------------------------------------------------------------------
-- Returns: request window is 48 hours after delivery. Every request requires
-- an administrator decision; policy eligibility is not auto-approved.
-- ---------------------------------------------------------------------------
CREATE TABLE return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  delivery_job_id uuid NOT NULL REFERENCES delivery_jobs(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  customer_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','collection_arranged','received','refund_pending','refunded','exchanged','closed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decision_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  decision_at timestamptz,
  decision_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION enforce_return_request_window() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE delivered_at_value timestamptz;
BEGIN
  SELECT customer_confirmed_at INTO delivered_at_value
  FROM delivery_jobs
  WHERE id = NEW.delivery_job_id
    AND order_id = NEW.order_id;

  IF delivered_at_value IS NULL THEN
    RAISE EXCEPTION 'OTP and photo-confirmed delivery is required before a return request'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.requested_at > delivered_at_value + interval '48 hours' THEN
    RAISE EXCEPTION 'Return requests must be submitted within 48 hours of delivery'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER return_request_48_hour_window
BEFORE INSERT ON return_requests
FOR EACH ROW EXECUTE FUNCTION enforce_return_request_window();

CREATE INDEX return_requests_status_idx ON return_requests(status, requested_at DESC);
CREATE INDEX return_requests_order_idx ON return_requests(order_id);

-- ---------------------------------------------------------------------------
-- Promotions and discount windows. Pricing calculations remain server-side.
-- ---------------------------------------------------------------------------
CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed_amount')),
  discount_value bigint NOT NULL CHECK (discount_value > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  minimum_order_kobo bigint NOT NULL DEFAULT 0 CHECK (minimum_order_kobo >= 0),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'percentage' OR discount_value <= 10000)
);

CREATE INDEX promotions_active_window_idx
  ON promotions(starts_at, ends_at) WHERE is_active;

-- International quotations require an explicit staff approval before payment.
ALTER TABLE international_requests
  ADD COLUMN IF NOT EXISTS quote_approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quote_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX international_requests_quote_review_idx
  ON international_requests(status, quote_expires_at);

INSERT INTO schema_migrations(version) VALUES ('002_approved_commerce_rules')
ON CONFLICT (version) DO NOTHING;

COMMIT;
