-- Phase 5: add durable admin-actor audit identity for exception decisions.
alter table public.delivery_exceptions
  add column if not exists resolved_by_email text;

create index if not exists delivery_exceptions_status_created_idx
  on public.delivery_exceptions(status, created_at desc);

create index if not exists delivery_evidence_expiry_idx
  on public.delivery_evidence(expires_at);

create index if not exists verified_delivery_evidence_verified_at_idx
  on public.verified_delivery_evidence(verified_at);
