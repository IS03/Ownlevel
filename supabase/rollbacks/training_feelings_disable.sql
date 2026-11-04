-- Operator-only deactivation; NOT an automatic down migration. Preserves all recorded facts and receipts.
begin;
revoke execute on function public.mutate_training_feelings_v1(uuid,jsonb), public.read_training_feelings_v1(uuid) from authenticated;
-- Legacy session APIs, tables, RLS, facts and idempotency receipts are untouched.
-- Re-enable only after review: GRANT EXECUTE on these two signatures TO authenticated.
commit;
