-- Data change (PO decision, 18/11/2026, same rule as 20261118140235): a meal is eaten when it is loaded. ChatGPT meals loaded
-- before #308/#367 kept no record of where their time came from, so Comparaciones treated them as an approximate time and left
-- them out of «3 h antes» and «última comida». Their time is the load: in production 285 of 293 sit within 10 minutes of
-- created_at. Those, and only those, become `registration_now` (the source new ChatGPT loads «eaten now» already get).
--
-- Scope: ChatGPT meals, not deleted, without raw_input evidence, source unknown (null), the time within 10 minutes of the load,
-- and on the meal's own day. A time farther from the load may be one the person said; it keeps no source. consumed_at is not
-- touched; only its source.
-- Applied in production on 18/11/2026: 270 meals (15 more were on another day and 8 farther from the load: untouched).
--
-- Reversal (restores each row's previous source exactly):
--   update public.meal_entries m set consumed_at_source = b.previous_source
--     from ownlevel_private.meal_time_backfill_chatgpt_20261118 b where m.id = b.meal_id;
--   drop table ownlevel_private.meal_time_backfill_chatgpt_20261118;
create table if not exists ownlevel_private.meal_time_backfill_chatgpt_20261118 (
  meal_id uuid primary key,
  previous_source text,
  changed_at timestamptz not null default now()
);
alter table ownlevel_private.meal_time_backfill_chatgpt_20261118 enable row level security;
revoke all on ownlevel_private.meal_time_backfill_chatgpt_20261118 from public, anon, authenticated;

with target as (
  select m.id, m.consumed_at_source
  from public.meal_entries m join public.day_logs d on d.id = m.day_log_id
  where m.deleted_at is null and m.source_type = 'chatgpt' and m.entry_kind = 'meal' and m.raw_input is null
    and m.consumed_at_source is null
    and abs(extract(epoch from (m.created_at - m.consumed_at))) <= 600
    and (m.consumed_at at time zone 'America/Argentina/Cordoba')::date = d.log_date
), saved as (
  insert into ownlevel_private.meal_time_backfill_chatgpt_20261118(meal_id, previous_source)
  select id, consumed_at_source from target on conflict (meal_id) do nothing returning meal_id
)
update public.meal_entries m set consumed_at_source = 'registration_now'
from saved where m.id = saved.meal_id;
