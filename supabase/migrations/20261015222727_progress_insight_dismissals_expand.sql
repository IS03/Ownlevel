-- Progreso stage 4 · EXPAND: dismissed automatic insights ("No me interesa"). Plan: bocetos/que-influye/PLAN.md (paso 4).
-- An insight key is a ready-made Qué influye question; once dismissed it never comes back for that user.
-- Clients read through RLS (owner only) and write only through the function below (identity from auth.uid()).
-- Dismissing twice is the same as once (idempotent by primary key).
begin;

create table if not exists public.progress_insight_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_key text not null check (insight_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, insight_key)
);
alter table public.progress_insight_dismissals enable row level security;
revoke all on public.progress_insight_dismissals from public, anon, authenticated;
grant select on public.progress_insight_dismissals to authenticated;
drop policy if exists progress_insight_dismissals_owner_select on public.progress_insight_dismissals;
create policy progress_insight_dismissals_owner_select on public.progress_insight_dismissals for select to authenticated using (user_id = (select auth.uid()));

create schema if not exists ownlevel_private;
create or replace function ownlevel_private.dismiss_progress_insight(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_at timestamptz;
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception using errcode = '22023', message = 'El aviso no es válido.'; end if;
  insert into public.progress_insight_dismissals(user_id, insight_key) values (v_uid, p_key) on conflict do nothing;
  select dismissed_at into v_at from public.progress_insight_dismissals where user_id = v_uid and insight_key = p_key;
  return jsonb_build_object('key', p_key, 'dismissedAt', v_at);
end;
$$;
revoke all on function ownlevel_private.dismiss_progress_insight(text) from public, anon;
grant execute on function ownlevel_private.dismiss_progress_insight(text) to authenticated;
create or replace function public.mobile_dismiss_progress_insight(p_key text)
returns jsonb language sql security invoker set search_path = '' as $$
  select ownlevel_private.dismiss_progress_insight(p_key)
$$;
revoke all on function public.mobile_dismiss_progress_insight(text) from public, anon;
grant execute on function public.mobile_dismiss_progress_insight(text) to authenticated;

commit;
