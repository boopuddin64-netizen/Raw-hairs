-- grok_catalogue_import was applied to production twice (20261112065539 and this version).
-- The migration is idempotent, so the second run changed nothing. This no-op file only keeps the
-- local migration history aligned with the remote one for `supabase db push`.
select 1;
