-- RAW HAIRS Phase 1 - CORRECTED, part 3 of 4
-- Payments, return requests, refund transactions, notifications, audit log.
-- Apply after parts 1, 1b, 2.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_method text not null check (payment_method in ('paystack', 'bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_verification', 'successful', 'failed', 'refunded', 'partially_refunded')),
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  reference text unique,
  provider text,
  provider_response jsonb,
  failure_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists payments_status_idx on public.payments(status);
alter table public.payments enable row level security;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  requested_by uuid references auth.users(id),
  requester_email text,
  product_id uuid references public.products(id),
  product_name text,
  reason text not null,
  description text,
  evidence_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'returned', 'refunded', 'closed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);
create index if not exists returns_order_idx on public.return_requests(order_id);
alter table public.return_requests enable row level security;

create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  return_request_id uuid references public.return_requests(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'initiated'
    check (status in ('initiated', 'processing', 'completed', 'failed', 'rejected')),
  channel text,
  provider_reference text,
  initiated_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.refund_transactions enable row level security;

create or replace function public.validate_refund_amount()
returns trigger language plpgsql set search_path = ''
as $$
declare v_paid bigint;
begin
  select amount_kobo into v_paid from public.payments where id = new.payment_id;
  if coalesce(v_paid, 0) <= 0 or new.amount_kobo > v_paid then
    raise exception 'Refund amount exceeds the original successful payment';
  end if;
  return new;
end $$;
drop trigger if exists refund_amount_check on public.refund_transactions;
create trigger refund_amount_check before insert on public.refund_transactions
  for each row execute function public.validate_refund_amount();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  event_type text not null,
  title text not null,
  body text,
  related_order uuid references public.orders(id),
  related_booking uuid references public.bookings(id),
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  actor_email text,
  action text not null,
  table_name text,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;