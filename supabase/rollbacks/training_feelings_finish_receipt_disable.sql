-- Disable negotiated receipts without deleting facts, original receipts, or changing installed v1.
revoke execute on function public.finish_training_feelings_v2(uuid,jsonb) from authenticated;
