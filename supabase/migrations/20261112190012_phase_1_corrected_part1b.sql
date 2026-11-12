-- RAW HAIRS Phase 1 - CORRECTED, part 1b
-- Kobo money columns with bidirectional naira<->kobo sync, one-shot backfill,
-- guest-ready orders with approval-workflow statuses.
-- Apply after part 1.

alter table public.products
  add column if not exists price_kobo bigint not null default 0;
alter table public.orders
  add column if not exists subtotal_kobo bigint not null default 0,
  add column if not exists delivery_fee_kobo bigint not null default 0,
  add column if not exists total_kobo bigint not null default 0;
alter table public.order_items
  add column if not exists unit_price_kobo bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_kobo_check') then
    alter table public.products add constraint products_price_kobo_check check (price_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_subtotal_kobo_check') then
    alter table public.orders add constraint orders_subtotal_kobo_check check (subtotal_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_kobo_check') then
    alter table public.orders add constraint orders_delivery_kobo_check check (delivery_fee_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_total_kobo_check') then
    alter table public.orders add constraint orders_total_kobo_check check (total_kobo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_kobo_check') then
    alter table public.order_items add constraint order_items_kobo_check check (unit_price_kobo >= 0);
  end if;
end $$;

-- Legacy naira columns get defaults so RPC inserts that only set kobo succeed.
alter table public.orders
  alter column subtotal set default 0,
  alter column delivery_fee set default 0,
  alter column total set default 0;
alter table public.order_items alter column unit_price set default 0;

-- Bidirectional sync: editing kobo updates naira; editing legacy naira updates kobo.
create or replace function public.sync_money_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    if tg_op = 'UPDATE' then
      if new.price_kobo is distinct from old.price_kobo then
        new.price := round(new.price_kobo / 100.0, 2);
      elsif new.price is distinct from old.price then
        new.price_kobo := round(coalesce(new.price, 0) * 100)::bigint;
      end if;
    else
      if new.price_kobo = 0 and new.price is not null then
        new.price_kobo := round(new.price * 100)::bigint;
      else
        new.price := round(new.price_kobo / 100.0, 2);
      end if;
    end if;
  elsif tg_table_name = 'orders' then
    if tg_op = 'UPDATE' then
      if new.subtotal_kobo is distinct from old.subtotal_kobo
         or new.delivery_fee_kobo is distinct from old.delivery_fee_kobo
         or new.total_kobo is distinct from old.total_kobo then
        new.subtotal := round(new.subtotal_kobo / 100.0, 2);
        new.delivery_fee := round(new.delivery_fee_kobo / 100.0, 2);
        new.total := round(new.total_kobo / 100.0, 2);
      elsif new.subtotal is distinct from old.subtotal
         or new.delivery_fee is distinct from old.delivery_fee
         or new.total is distinct from old.total then
        new.subtotal_kobo := round(coalesce(new.subtotal, 0) * 100)::bigint;
        new.delivery_fee_kobo := round(coalesce(new.delivery_fee, 0) * 100)::bigint;
        new.total_kobo := round(coalesce(new.total, 0) * 100)::bigint;
      end if;
    else
      if new.subtotal_kobo = 0 and new.subtotal is not null then
        new.subtotal_kobo := round(new.subtotal * 100)::bigint;
      end if;
      if new.delivery_fee_kobo = 0 and new.delivery_fee is not null then
        new.delivery_fee_kobo := round(new.delivery_fee * 100)::bigint;
      end if;
      if new.total_kobo = 0 and new.total is not null then
        new.total_kobo := round(new.total * 100)::bigint;
      end if;
    end if;
  elsif tg_table_name = 'order_items' then
    if tg_op = 'UPDATE' then
      if new.unit_price_kobo is distinct from old.unit_price_kobo then
        new.unit_price := round(new.unit_price_kobo / 100.0, 2);
      elsif new.unit_price is distinct from old.unit_price then
        new.unit_price_kobo := round(coalesce(new.unit_price, 0) * 100)::bigint;
      end if;
    else
      if new.unit_price_kobo = 0 and new.unit_price is not null then
        new.unit_price_kobo := round(new.unit_price * 100)::bigint;
      else
        new.unit_price := round(new.unit_price_kobo / 100.0, 2);
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists products_money_sync on public.products;
create trigger products_money_sync before insert or update on public.products
  for each row execute function public.sync_money_columns();
drop trigger if exists orders_money_sync on public.orders;
create trigger orders_money_sync before insert or update on public.orders
  for each row execute function public.sync_money_columns();
drop trigger if exists order_items_money_sync on public.order_items;
create trigger order_items_money_sync before insert or update on public.order_items
  for each row execute function public.sync_money_columns();

-- One-shot kobo backfill (guarded: only where kobo is still 0).
do $$
begin
  update public.products set price_kobo = round(coalesce(price, 0) * 100)::bigint
   where price is not null and price_kobo = 0;
  update public.orders set
    subtotal_kobo = round(coalesce(subtotal, 0) * 100)::bigint,
    delivery_fee_kobo = round(coalesce(delivery_fee, 0) * 100)::bigint,
    total_kobo = round(coalesce(total, 0) * 100)::bigint
   where total is not null and total_kobo = 0;
  update public.order_items set unit_price_kobo = round(coalesce(unit_price, 0) * 100)::bigint
   where unit_price is not null and unit_price_kobo = 0;
end $$;

-- Orders: guest checkout fields, payment method, approval workflow.
alter table public.orders
  alter column customer_id drop not null,
  add column if not exists guest_email text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_state text,
  add column if not exists delivery_city text,
  add column if not exists delivery_instructions text,
  add column if not exists payment_method text default 'paystack',
  add column if not exists approved_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_check') then
    alter table public.orders add constraint orders_payment_method_check
      check (payment_method in ('paystack', 'bank_transfer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_status_check_new') then
    alter table public.orders drop constraint if exists orders_status_check;
    alter table public.orders add constraint orders_status_check_new check (status in (
      'awaiting_payment','paid','pending_admin_approval','processing','dispatched',
      'delivered','cancelled','refunded'
    ));
  end if;
end $$;
create index if not exists orders_guest_email_idx on public.orders(guest_email);