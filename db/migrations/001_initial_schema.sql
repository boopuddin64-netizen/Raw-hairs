-- RAW HAIRS PostgreSQL foundation
-- Migration 001. Apply only to an isolated development database after selecting a provider.
-- All monetary values are integer kobo. This database is server-authoritative.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku text NOT NULL UNIQUE,
  label text NOT NULL,
  length_inches integer CHECK (length_inches IS NULL OR length_inches BETWEEN 1 AND 60),
  texture text,
  lace_type text,
  density text,
  hair_type text,
  colour text,
  cap_size text,
  price_kobo bigint NOT NULL CHECK (price_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, label)
);

CREATE TABLE inventory_balances (
  variant_id uuid PRIMARY KEY REFERENCES product_variants(id) ON DELETE RESTRICT,
  on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text UNIQUE,
  email text,
  phone text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (firebase_uid IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner','admin','rider')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The trigger serializes staff-seat changes and enforces a maximum of four active
-- owner/admin accounts. Rider accounts do not consume an owner/admin seat.
CREATE OR REPLACE FUNCTION enforce_staff_seat_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE active_seats integer;
BEGIN
  PERFORM pg_advisory_xact_lock(740291);
  SELECT count(*) INTO active_seats
  FROM staff_users
  WHERE is_active AND role IN ('owner','admin')
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF NEW.is_active AND NEW.role IN ('owner','admin') AND active_seats >= 4 THEN
    RAISE EXCEPTION 'Maximum of four active owner/admin staff accounts reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_seat_limit_before_write
BEFORE INSERT OR UPDATE OF role, is_active ON staff_users
FOR EACH ROW EXECUTE FUNCTION enforce_staff_seat_limit();

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  guest_token_hash text,
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','verified_paid','failed','expired','partially_refunded','refunded','review_required')),
  fulfilment_status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (fulfilment_status IN ('awaiting_payment','paid_awaiting_admin_approval','approved_for_fulfilment','processing','ready_for_dispatch','assigned','accepted_by_rider','in_transit','delivered_pending_customer_confirmation','completed','cancelled')),
  subtotal_kobo bigint NOT NULL CHECK (subtotal_kobo >= 0),
  delivery_kobo bigint NOT NULL DEFAULT 0 CHECK (delivery_kobo >= 0),
  discount_kobo bigint NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  tax_kobo bigint NOT NULL DEFAULT 0 CHECK (tax_kobo >= 0),
  total_kobo bigint NOT NULL CHECK (total_kobo >= 0),
  admin_approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  admin_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((customer_id IS NOT NULL) OR (guest_token_hash IS NOT NULL)),
  CHECK (total_kobo = subtotal_kobo + delivery_kobo + tax_kobo - discount_kobo)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  variant_snapshot jsonb NOT NULL,
  sku_snapshot text NOT NULL,
  unit_price_kobo bigint NOT NULL CHECK (unit_price_kobo >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_kobo bigint NOT NULL CHECK (line_total_kobo >= 0),
  CHECK (line_total_kobo = unit_price_kobo * quantity)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','reservation','reservation_release','sale','return','adjustment')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reference_type text,
  reference_id uuid,
  reason text NOT NULL,
  actor_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('customer','guest','staff','rider','system','provider')),
  actor_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('in_house','third_party','admin_quote')),
  provider_code text,
  provider_quote_ref text,
  amount_kobo bigint NOT NULL CHECK (amount_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted','selected','expired','rejected')),
  raw_response_redacted jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('in_house','third_party')),
  provider_code text,
  provider_job_ref text,
  rider_staff_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_assignment'
    CHECK (status IN ('pending_assignment','offered','accepted','picked_up','in_transit','delivered','customer_confirmed','failed','cancelled')),
  customer_confirmation_hash text,
  assigned_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id uuid NOT NULL REFERENCES delivery_jobs(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','rider','provider','system')),
  actor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('paystack','manual_transfer')),
  provider_reference text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('card','bank_transfer','ussd','manual_bank_transfer')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','initialized','verified','failed','expired','review_required','refunded','partially_refunded')),
  initialized_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_reference text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  verified_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id uuid NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','processing','processed','failed','rejected')),
  provider_ref text UNIQUE,
  requested_by text NOT NULL,
  approved_by uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  description text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  debit_kobo bigint NOT NULL DEFAULT 0 CHECK (debit_kobo >= 0),
  credit_kobo bigint NOT NULL DEFAULT 0 CHECK (credit_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_kobo > 0 AND credit_kobo = 0) OR (credit_kobo > 0 AND debit_kobo = 0))
);

-- Deferred validation permits a balanced multi-line journal to be assembled in
-- one transaction, but rejects an unbalanced or empty journal at COMMIT.
CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
DECLARE entry_count integer;
DECLARE debit_total numeric;
DECLARE credit_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  END IF;
  SELECT count(*), COALESCE(sum(debit_kobo),0), COALESCE(sum(credit_kobo),0)
    INTO entry_count, debit_total, credit_total
  FROM ledger_entries WHERE transaction_id = target_id;
  IF entry_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Ledger transaction % is not balanced (entries %, debit %, credit %)',
      target_id, entry_count, debit_total, credit_total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_must_balance
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_transaction_must_have_entries
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

-- Posted journals are immutable. Correct mistakes with a reversing journal.
CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted ledger records are immutable; create a reversing transaction'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();


CREATE TABLE international_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  email text,
  whatsapp text NOT NULL,
  destination_country text NOT NULL,
  delivery_address text NOT NULL,
  requested_items jsonb NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','admin_review','quote_prepared','quote_sent','customer_accepted','payment_pending','paid','fulfilment','declined','expired','cancelled')),
  quote_kobo bigint CHECK (quote_kobo IS NULL OR quote_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  quote_expires_at timestamptz,
  admin_owner_id uuid REFERENCES staff_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('customer','guest','staff','rider','system','provider')),
  actor_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_variants_product_idx ON product_variants(product_id);
CREATE INDEX inventory_movements_variant_created_idx ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX orders_customer_created_idx ON orders(customer_id, created_at DESC);
CREATE INDEX orders_payment_status_idx ON orders(payment_status, created_at DESC);
CREATE INDEX orders_fulfilment_status_idx ON orders(fulfilment_status, created_at DESC);
CREATE INDEX payment_attempts_order_idx ON payment_attempts(order_id, created_at DESC);
CREATE INDEX payment_events_reference_idx ON payment_events(provider_reference);
CREATE INDEX ledger_entries_transaction_idx ON ledger_entries(transaction_id);
CREATE INDEX delivery_jobs_rider_status_idx ON delivery_jobs(rider_staff_id, status);
CREATE INDEX international_requests_status_created_idx ON international_requests(status, created_at DESC);
CREATE INDEX notification_outbox_due_idx ON notification_outbox(status, next_attempt_at);
CREATE INDEX audit_events_target_idx ON audit_events(target_type, target_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('001_initial_schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;
