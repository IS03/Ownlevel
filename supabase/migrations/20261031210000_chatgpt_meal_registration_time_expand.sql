-- #308 EXPAND: a ChatGPT meal the user is eating now ("subí esto") keeps its registration instant as an approximate
-- time. v2 already stores consumed_at = now() and raw_input {"originalTimeKnown":false} when no time is given; v3
-- records why: {"originalTimeKnown":false,"timeSource":"registration"}. originalTimeKnown stays false, so every
-- reader that only knows that flag (stats included) keeps treating the time as not confirmed.
--
-- Additive: v2 is unchanged and keeps serving every other call. A registration meal must belong to today in Córdoba
-- (checked here with the transaction clock, not trusted from the caller). Idempotent replays and possible_duplicate
-- behave exactly as in v2; only a newly created row is marked.
--
-- Reversal: deploy code that no longer calls v3 (it already falls back to v2 when v3 is missing), then:
--   drop function if exists public.create_chatgpt_meal_for_oauth_v3(uuid,uuid,uuid,uuid,text,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text);
--   drop function if exists public.create_chatgpt_meal_for_integration_v3(uuid,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text);
-- Rows already marked keep a harmless extra key that readers without this change ignore.
begin;

create function public.create_chatgpt_meal_for_integration_v3(
  p_user_id uuid, p_log_date date, p_title text, p_description text, p_calories integer,
  p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric, p_idempotency_key text,
  p_force_duplicate boolean default false, p_meal_label text default null, p_time_source text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if p_time_source is not null and p_time_source <> 'registration' then
    raise exception 'invalid_request';
  end if;
  if p_time_source = 'registration' and p_log_date <> (now() at time zone 'America/Argentina/Cordoba')::date then
    raise exception 'invalid_request';
  end if;
  v_result := public.create_chatgpt_meal_for_integration_v2(
    p_user_id, p_log_date, p_title, p_description, p_calories, p_protein_g, p_carbs_g, p_fat_g,
    p_idempotency_key, p_force_duplicate, null, p_meal_label
  );
  if p_time_source = 'registration' and (v_result->>'created')::boolean then
    update public.meal_entries
    set raw_input = '{"originalTimeKnown":false,"timeSource":"registration"}'
    where id = (v_result->'meal'->>'id')::uuid and user_id = p_user_id
      and raw_input = '{"originalTimeKnown":false}';
  end if;
  return v_result;
end;
$$;

revoke all on function public.create_chatgpt_meal_for_integration_v3(uuid,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.create_chatgpt_meal_for_integration_v3(uuid,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text) to service_role;

create function public.create_chatgpt_meal_for_oauth_v3(
  p_user_id uuid, p_client_id uuid, p_session_id uuid, p_grant_id uuid, p_resource text,
  p_log_date date, p_title text, p_description text, p_calories integer,
  p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric,
  p_idempotency_key text, p_force_duplicate boolean default false,
  p_meal_label text default null, p_time_source text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  -- Same checks and lock order as create_chatgpt_meal_for_oauth_v2.
  perform 1 from ownlevel_integrations.oauth_clients
    where client_id = p_client_id for share;
  perform 1 from ownlevel_integrations.oauth_grants
    where user_id = p_user_id and client_id = p_client_id for share;
  if not public.ownlevel_oauth_access_allowed(
    p_user_id, p_client_id, p_session_id, p_grant_id, p_resource
  ) then raise exception 'oauth_permission_denied' using errcode = '42501'; end if;
  return public.create_chatgpt_meal_for_integration_v3(
    p_user_id, p_log_date, p_title, p_description, p_calories,
    p_protein_g, p_carbs_g, p_fat_g, p_idempotency_key, p_force_duplicate, p_meal_label, p_time_source
  );
end;
$$;

revoke all on function public.create_chatgpt_meal_for_oauth_v3(uuid,uuid,uuid,uuid,text,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.create_chatgpt_meal_for_oauth_v3(uuid,uuid,uuid,uuid,text,date,text,text,integer,numeric,numeric,numeric,text,boolean,text,text) to service_role;

commit;
