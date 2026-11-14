-- RAW HAIRS: remove broad authenticated writes that bypass the validated admin
-- API. Reads remain covered by existing customer/owner/public policies; trusted
-- service-role endpoints and SECURITY DEFINER workflow RPCs remain the writers.
-- This migration is source-only in this task and is not applied to production.

-- Profiles remain self-service only (Account.jsx); the separate admin API does
-- not need a direct authenticated-owner bypass.
drop policy if exists "Owner manages profiles" on public.profiles;

-- Product and service edits go through the allowlisted admin API.
drop policy if exists "Owner manages products" on public.products;
drop policy if exists "Owner manages services" on public.services;
revoke insert, update, delete on table public.products, public.services from anon, authenticated;

-- Bookings and orders are created by their server-validated RPCs. Orders,
-- items, payments and rider dispatch are changed only through the server or
-- tightly scoped driver/OTP workflow.
drop policy if exists "Owner manages bookings" on public.bookings;
drop policy if exists "Owner manages orders" on public.orders;
drop policy if exists "Owner updates order items" on public.order_items;
drop policy if exists "Owner manages rider jobs" on public.rider_jobs;
drop policy if exists "Owner manages payments" on public.payments;
revoke insert, update, delete on table public.bookings, public.orders, public.order_items, public.payments from anon, authenticated;
revoke all on function public.admin_confirm_bank_transfer(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_confirm_bank_transfer(uuid, boolean, text) to service_role;
revoke select, insert, update, delete on table public.rider_jobs from public, anon, authenticated;
grant select (id, order_id, rider_id, status, delivery_photo_path, created_at, updated_at)
  on table public.rider_jobs to authenticated;
grant update (status) on table public.rider_jobs to authenticated;

-- Keep the signed-in customer request form's direct INSERT, but constrain it to
-- a modest, pending request owned by that customer. All subsequent edits happen
-- through the owner-session server API.
drop policy if exists "Owner manages international requests" on public.international_requests;
drop policy if exists "Customers create own international requests" on public.international_requests;
create policy "Customers create bounded own international requests"
  on public.international_requests for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'pending'
    and length(trim(customer_name)) between 2 and 120
    and length(trim(customer_email)) between 3 and 254
    and trim(customer_email) ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and length(trim(destination_country)) between 2 and 100
    and coalesce(length(request_details), 0) <= 16000
  );
revoke update, delete on table public.international_requests from anon, authenticated;
grant insert on table public.international_requests to authenticated;

-- Returns/refunds, notifications, reviews and settings are read through the
-- server dashboard or customer-owned read policies; no browser client writes.
drop policy if exists "Owner manages return requests" on public.return_requests;
drop policy if exists "Owner manages refunds" on public.refund_transactions;
drop policy if exists "Owner manages notifications" on public.notifications;
drop policy if exists "Owner manages reviews" on public.reviews;
drop policy if exists "Owner manages store settings" on public.store_settings;
drop policy if exists "Owner manages reservations" on public.inventory_reservations;
revoke insert, update, delete on table public.return_requests, public.refund_transactions,
  public.notifications, public.reviews, public.store_settings, public.inventory_reservations
  from anon, authenticated;

-- Customers can read only their own payment/return/refund records; the admin
-- console uses the authenticated server API. Product images are uploaded via
-- short-lived signed URLs minted by that API, not the broad owner storage rule.
drop policy if exists "Owner manages product images" on storage.objects;
