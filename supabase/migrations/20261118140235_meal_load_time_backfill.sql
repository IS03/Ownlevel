-- Data change (PO decision, 18/11/2026): a meal loaded by hand without choosing a time keeps its load time as a real time
-- («I load when I eat; if not, I edit it»). New loads already send it as declared (#552). This brings the existing ones in
-- line, so Comparaciones and «Cuándo comés» use them. It supersedes the «never backfilled» note of 20261105210605 for
-- these rows only.
--
-- Scope: manual meals (not ChatGPT, imports or daily summaries), not deleted, without raw_input evidence, whose source was
-- unknown (null) or default_clock, and whose load time falls on the meal's own day. A meal loaded for another day keeps no
-- time: its clock is the load, not the meal (3 rows on 18/11). consumed_at is not touched; only its source.
-- Applied in production on 18/11/2026: 273 meals (30 default_clock, 243 unknown), 2 accounts.
--
-- Reversal (restores each row's previous source exactly):
--   update public.meal_entries m set consumed_at_source = b.previous_source
--     from ownlevel_private.meal_time_backfill_20261118 b where m.id = b.meal_id;
--   drop table ownlevel_private.meal_time_backfill_20261118;
create table if not exists ownlevel_private.meal_time_backfill_20261118 (
  meal_id uuid primary key,
  previous_source text,
  changed_at timestamptz not null default now()
);
alter table ownlevel_private.meal_time_backfill_20261118 enable row level security;
revoke all on ownlevel_private.meal_time_backfill_20261118 from public, anon, authenticated;

with target as (
  select m.id, m.consumed_at_source
  from public.meal_entries m join public.day_logs d on d.id = m.day_log_id
  where m.deleted_at is null and m.source_type = 'manual' and m.entry_kind = 'meal' and m.raw_input is null
    and (m.consumed_at_source is null or m.consumed_at_source = 'default_clock')
    and (m.consumed_at at time zone 'America/Argentina/Cordoba')::date = d.log_date
), saved as (
  insert into ownlevel_private.meal_time_backfill_20261118(meal_id, previous_source)
  select id, consumed_at_source from target on conflict (meal_id) do nothing returning meal_id
)
update public.meal_entries m set consumed_at_source = 'user_declared'
from saved where m.id = saved.meal_id;
