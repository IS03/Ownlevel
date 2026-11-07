// Opt-in REAL PostgreSQL/PostgREST regression, provisioned and removed by scripts/testing/period-details-local.mjs.
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/v1/progress/performance-insights/route";
import { readInsightsSource, readPeriodFeelingSource, readPeriodMeals } from "./performance-insights-server";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { periodFeelingDetail, periodNutritionDetail } from "../progress/insights-engine/period-details";
import { createInsightsSnapshot, insightsPeriodSummary } from "../progress/insights-engine/read-model";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mock.auth }));
vi.mock("@/lib/phase2/cordoba-date", async importOriginal => ({ ...await importOriginal<typeof import('@/lib/phase2/cordoba-date')>(), todayInCordoba: () => '2026-11-07' }));
const db = process.env.OWNLEVEL_PERIOD_LOCAL_DB, base = process.env.OWNLEVEL_PERIOD_LOCAL_URL, task = process.env.OWNLEVEL_PERIOD_LOCAL_TASK;
const OWNER = '93670421-0000-4000-8000-000000000001', OTHER = '93670421-0000-4000-8000-000000000002';
const AS_OF = '2026-11-07', TODAY = '2026-11-07', START = '2026-08-01', END = '2026-10-31';
const range = `l.log_date between '${START}' and '${END}'`;
function docker(args: string[], input?: string) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 << 20, timeout: 120_000 });
  if (r.status !== 0) throw Error(r.stderr || r.stdout || String(r.error)); return r.stdout.trim();
}
const sql = (input: string) => docker(['exec', '-i', db!, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], input);
const json = (query: string) => JSON.parse(sql(query));
type Trace = { table: string; url: URL; rows: Record<string, unknown>[]; status: number };
function clientFor(identity: string, onResponse?: (trace: Trace) => void) {
  const traces: Trace[] = [];
  const client = createClient(base!, 'synthetic-unused-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== base || !url.pathname.startsWith('/rest/v1/')) throw Error('Refuse a nonlocal reader request');
      url.pathname = url.pathname.replace('/rest/v1/', '/');
      const headers = new Headers(init?.headers); headers.delete('authorization'); headers.delete('apikey'); headers.set('x-ownlevel-test-user', identity);
      const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30_000) });
      const text = await response.clone().text(), body = text ? JSON.parse(text) : [];
      const trace = { table: url.pathname.slice(1), url, rows: Array.isArray(body) ? body : [body], status: response.status };
      traces.push(trace); onResponse?.(trace); return response;
    },
  } });
  const context = (userId = identity) => ({ userId, supabase: client }) as unknown as MobileSupabaseAuthenticatedContext;
  return { client, traces, context };
}
const route = (view: string, asOf = AS_OF) => GET(new NextRequest(`http://localhost/api/mobile/v1/progress/performance-insights?view=${view}&method=2&asOf=${asOf}`, { headers: { authorization: 'Bearer synthetic-not-a-token' } }));
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function seed() {
  // Preserve every production constraint/trigger/RLS policy. Auth rows are synthetic and no login/token is created.
  sql(`insert into auth.users(id) values('${OWNER}'),('${OTHER}');
    insert into public.profiles(user_id) values('${OWNER}'),('${OTHER}') on conflict do nothing;
    do $seed$ declare who uuid; ex uuid; sid uuid; d date; total int; facts jsonb; pre jsonb; post jsonb; begin
      for who,total in select * from (values('${OWNER}'::uuid,1009),('${OTHER}'::uuid,3)) v loop
        perform set_config('request.jwt.claim.sub',who::text,false);
        insert into public.exercises(user_id,nombre,weight_mode) values(who,'SYNTHETIC PERIOD PRESS','Peso total') returning id into ex;
        for i in 0..total-1 loop
          d := case when i=1005 then '2026-07-31'::date when i=1006 then '2026-11-01'::date else '2026-08-03'::date+(i % 20) end;
          insert into public.day_logs(user_id,log_date) values(who,d) on conflict do nothing;
          insert into public.workout_sessions(user_id,day_log_id,started_at,energy_level)
            select who,id,(d::timestamp+interval '18 hours') at time zone 'America/Argentina/Cordoba',2 from public.day_logs where user_id=who and log_date=d returning id into sid;
          insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values(who,sid,ex,1);
          update public.workout_session_exercises set is_completed=true where workout_session_id=sid;
          insert into public.workout_sets(user_id,workout_session_exercise_id,set_number)
            select who,x.id,n from public.workout_session_exercises x cross join generate_series(1,3) n where x.workout_session_id=sid on conflict do nothing;
          update public.workout_sets t set is_completed=i % 7<>3 and t.set_number<>3,actual_reps=8,actual_weight_kg=20,
            completed_at=case when i % 7=3 then null else (d::timestamp+case t.set_number when 1 then interval '18 hours 10 minutes' when 2 then interval '18 hours 20 minutes' else interval '18 hours 1 minute' end) at time zone 'America/Argentina/Cordoba' end
            from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id=sid;
          pre := jsonb_build_object('value',3,'instrumentVersion','energy-fatigue/1','declaredMoment','pre','declaredAt',null,
            'capturedAt',case when i % 7=4 then null else to_char(d,'YYYY-MM-DD')||case when i % 7 in (1,3) then 'T18:05:00-03:00' when i % 7=2 then 'T18:15:00-03:00' else 'T17:55:00-03:00' end end,
            'source','mobile','receivedAt','2026-11-07T12:00:00Z','temporalQuality',case when i % 7=4 then 'unknown' else 'unverified_client_clock' end);
          post := jsonb_build_object('value',4,'instrumentVersion','energy-fatigue/1','declaredMoment','post','declaredAt',null,
            'capturedAt',case when i % 17=0 then null else to_char(d,'YYYY-MM-DD')||case when i % 7=6 then 'T23:30:00-03:00' else 'T19:05:00-03:00' end end,
            'source','mobile','receivedAt','2026-11-07T12:00:00Z','temporalQuality',case when i % 17=0 then 'unknown' else 'unverified_client_clock' end);
          facts := '{}'::jsonb;
          if i % 7<>5 then facts := facts||jsonb_build_object('energyPre',pre); end if;
          if i % 11<>0 then facts := facts||jsonb_build_object('energyPost',post); end if;
          facts := facts||jsonb_build_object('fatiguePre',pre||jsonb_build_object('value',2));
          if i % 5<>0 then facts := facts||jsonb_build_object('fatiguePost',post||jsonb_build_object('value',2)); end if;
          insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values(sid,1,facts,now());
          if i<>1008 then update public.workout_sessions set status=(case when i=1007 then 'discarded' else 'completed' end)::public.workout_session_status,
            ended_at=(d::timestamp+interval '19 hours') at time zone 'America/Argentina/Cordoba' where id=sid; end if;
        end loop;
      end loop;
    end $seed$;
    insert into public.day_logs(user_id,log_date) select '${OWNER}',d::date from (values('2026-09-15'),('2026-09-16'),('2026-09-17'),('2026-09-18'),('2026-09-19'),('2026-10-01')) v(d) on conflict do nothing;
    insert into public.day_logs(user_id,log_date) values('${OTHER}','2026-09-15') on conflict do nothing;
    insert into public.meal_entries(user_id,day_log_id,source_type,final_calories,final_protein_g,final_carbs_g,final_fat_g)
      select '${OWNER}',d.id,'sheet_import',case when i%3=0 then 0 else 100 end,
        case when i%3=0 then 0 when i%3=1 then null else 10 end,case when i%3=0 then 0 when i%3=1 then 20 else null end,case when i%3=1 then null else 5 end
      from generate_series(0,1004) i join public.day_logs d on d.user_id='${OWNER}' and d.log_date=case when i<1001 then '2026-09-15'::date else '2026-09-16'::date+(i-1001) end;
    insert into public.meal_entries(user_id,day_log_id,source_type,entry_kind,legacy_import_source,legacy_import_id,precision_level,final_calories,final_protein_g,final_carbs_g,final_fat_g)
      select '${OWNER}',id,'sheet_import','legacy_daily_summary','synthetic','period-legacy','historical',500,25,50,20 from public.day_logs where user_id='${OWNER}' and log_date='2026-10-01';
    insert into public.meal_entries(user_id,day_log_id,source_type,final_calories,final_protein_g,final_carbs_g,final_fat_g,deleted_at)
      select '${OWNER}',id,'sheet_import',9999,999,999,999,now() from public.day_logs where user_id='${OWNER}' and log_date='2026-09-15';
    insert into public.meal_entries(user_id,day_log_id,source_type,final_calories) select user_id,id,'sheet_import',8888 from public.day_logs
      where (user_id='${OWNER}' and log_date in ('2026-07-31','2026-11-01')) or (user_id='${OTHER}' and log_date='2026-09-15');
    -- Dedicated zero and absent nutrient days, both without training. Calories are mandatory in the current schema.
    update public.meal_entries m set final_calories=0,final_protein_g=0,final_carbs_g=0,final_fat_g=0 from public.day_logs d where d.id=m.day_log_id and d.user_id='${OWNER}' and d.log_date='2026-09-17';
    update public.meal_entries m set final_protein_g=null,final_carbs_g=null,final_fat_g=null from public.day_logs d where d.id=m.day_log_id and d.user_id='${OWNER}' and d.log_date='2026-09-16';`);
}

describe.runIf(!!db && !!base && !!task)('#421 exact period readers on disposable PostgreSQL/PostgREST', () => {
  beforeAll(() => {
    expect(task).toMatch(/^ownlevel-period-[a-f0-9]{8}$/); expect(db).toBe(`${task}-db`);
    expect(new URL(base!).hostname).toBe('127.0.0.1'); expect(new URL(base!).pathname).toBe('/');
    expect(docker(['inspect', '--format', '{{index .Config.Labels "ownlevel.period-details-test"}}', db!])).toBe(task);
    expect(sql("select rolbypassrls from pg_roles where rolname='authenticated'")).toBe('f');
    expect(sql("select bool_and(relrowsecurity) from pg_class where oid in ('public.workout_sessions'::regclass,'public.workout_session_feelings'::regclass,'public.workout_sets'::regclass,'public.meal_entries'::regclass,'public.day_logs'::regclass)")).toBe('t');
    seed();
  }, 120_000);

  it('resolves every nested feeling/set join as to-one, pages all sources, equals SQL and preserves the summary timing', async () => {
    const who = clientFor(OWNER), source = await readPeriodFeelingSource(who.context(), AS_OF);
    const sessions = json(`select coalesce(json_agg(s.id order by s.id),'[]') from public.workout_sessions s join public.day_logs l on l.id=s.day_log_id where s.user_id='${OWNER}' and s.status='completed' and ${range}`);
    expect(source.sessions).toHaveLength(1005); expect(source.sessions.map(s => s.id)).toEqual(sessions);
    const feelings = json(`select json_agg(json_build_object('sessionId',f.session_id,'revision',f.revision,'facts',f.facts) order by f.session_id) from public.workout_session_feelings f join public.workout_sessions s on s.id=f.session_id join public.day_logs l on l.id=s.day_log_id where s.user_id='${OWNER}' and s.status='completed' and ${range}`);
    expect(source.feelings).toEqual(feelings); expect(source.feelings).toHaveLength(1005);
    const firstSets = json(`select json_agg(json_build_array(id,ms) order by id) from (select s.id,extract(epoch from min(t.completed_at))*1000 ms from public.workout_sets t join public.workout_session_exercises x on x.id=t.workout_session_exercise_id join public.workout_sessions s on s.id=x.workout_session_id join public.day_logs l on l.id=s.day_log_id where t.user_id='${OWNER}' and s.user_id='${OWNER}' and s.status='completed' and t.is_completed and t.completed_at is not null and ${range} group by s.id) q`);
    expect([...source.firstSetBySession].sort(([a], [b]) => a.localeCompare(b))).toEqual(firstSets);
    for (const table of ['workout_sessions', 'workout_session_feelings', 'workout_sets']) {
      const pages = who.traces.filter(t => t.table === table); expect(pages.length).toBeGreaterThan(1); expect(pages.every(p => p.status < 300)).toBe(true);
      const rows = pages.flatMap(p => p.rows), key = table === 'workout_session_feelings' ? 'session_id' : 'id';
      expect(new Set(rows.map(r => r[key])).size).toBe(rows.length); expect(pages[0]!.rows).toHaveLength(1000);
      if (table === 'workout_sessions') expect(rows[0]!.day).toEqual({ log_date: expect.any(String) });
      if (table === 'workout_session_feelings') expect(rows[0]!.session).toMatchObject({ user_id: OWNER, status: 'completed', day: { log_date: expect.any(String) } });
      if (table === 'workout_sets') expect(rows[0]!.exercise).toMatchObject({ workout_session_id: expect.any(String), session: { user_id: OWNER, status: 'completed', day: { log_date: expect.any(String) } } });
    }
    const setIds = json(`select json_agg(t.id order by t.id) from public.workout_sets t join public.workout_session_exercises x on x.id=t.workout_session_exercise_id join public.workout_sessions s on s.id=x.workout_session_id join public.day_logs l on l.id=s.day_log_id where t.user_id='${OWNER}' and s.user_id='${OWNER}' and s.status='completed' and t.is_completed and t.completed_at is not null and ${range}`);
    expect(who.traces.filter(t => t.table === 'workout_sets').flatMap(p => p.rows.map(r => r.id))).toEqual(setIds);
    const detail = periodFeelingDetail(source, TODAY, AS_OF, 'local', 2);
    const summary = insightsPeriodSummary(createInsightsSnapshot(await readInsightsSource(who.context()), { today: AS_OF, method: 2 }), []);
    expect(detail.outcomes).toEqual(summary.feelings); expect(parsePerformanceInsights(plain(detail))).toBeDefined();
    // Independent SQL check of the before-first-set group, not another call to the same parser.
    const beforeFirst = Number(sql(`select count(*) from public.workout_session_feelings f join public.workout_sessions s on s.id=f.session_id join public.day_logs l on l.id=s.day_log_id
      where s.user_id='${OWNER}' and s.status='completed' and ${range} and f.facts ? 'energyPost'
      and (f.facts->'energyPost'->>'capturedAt')::timestamptz between s.started_at and s.ended_at+interval '2 hours'
      and (f.facts->'energyPre'->>'capturedAt')::timestamptz > s.started_at
      and (f.facts->'energyPre'->>'capturedAt')::timestamptz <= (select min(t.completed_at) from public.workout_sets t join public.workout_session_exercises x on x.id=t.workout_session_exercise_id where x.workout_session_id=s.id and t.is_completed)`));
    expect(beforeFirst).toBeGreaterThan(0);
    const beforeStart = Number(sql(`select count(*) from public.workout_session_feelings f join public.workout_sessions s on s.id=f.session_id join public.day_logs l on l.id=s.day_log_id
      where s.user_id='${OWNER}' and s.status='completed' and ${range} and (f.facts->'energyPost'->>'capturedAt')::timestamptz between s.started_at and s.ended_at+interval '2 hours' and (f.facts->'energyPre'->>'capturedAt')::timestamptz <= s.started_at`));
    expect(detail.outcomes[0]!.byPrior[2]!.posts[3]).toBe(beforeFirst + beforeStart);
    for (const [identity, userId] of [[OTHER, OWNER], [OWNER, OTHER]]) {
      const empty = await readPeriodFeelingSource(clientFor(identity!).context(userId), AS_OF);
      expect([empty.sessions.length, empty.feelings.length, empty.firstSetBySession.size]).toEqual([0, 0, 0]);
    }
    expect((await readPeriodFeelingSource(clientFor(OTHER).context(), AS_OF)).sessions).toHaveLength(3);
    mock.auth.mockResolvedValue(who.context()); const routeStart = who.traces.length, response = await route('period-feelings'); const body = await response.json();
    expect(response.status).toBe(200); expect(parsePerformanceInsights(body)).toBeDefined(); expect(body.outcomes).toEqual(detail.outcomes);
    console.log(JSON.stringify({ view: 'period-feelings', sessions: sessions.length, feelings: feelings.length, firstSetRows: setIds.length, firstSetSessions: firstSets.length, queries: who.traces.length - routeStart, bytes: Buffer.byteLength(JSON.stringify(body)) }));
  }, 120_000);

  it('reads active meal/legacy rows in complete pages, equals independent daily SQL, and preserves zero/missing/non-training dates', async () => {
    const who = clientFor(OWNER), meals = await readPeriodMeals(who.context(), AS_OF);
    const where = `m.user_id='${OWNER}' and m.deleted_at is null and m.entry_kind in ('meal','legacy_daily_summary') and ${range}`;
    const truth = json(`select json_agg(json_build_object('date',l.log_date,'entryKind',m.entry_kind,'calories',m.final_calories,'proteinG',m.final_protein_g,'carbsG',m.final_carbs_g,'fatG',m.final_fat_g) order by m.id) from public.meal_entries m join public.day_logs l on l.id=m.day_log_id where ${where}`);
    expect(meals).toHaveLength(1006); expect(meals).toEqual(truth); expect(meals.filter(m => m.entryKind === 'legacy_daily_summary')).toHaveLength(1);
    const pages = who.traces.filter(t => t.table === 'meal_entries'); expect(pages.map(p => p.rows.length)).toEqual([1000, 6]);
    const ids = pages.flatMap(p => p.rows.map(r => r.id)); expect(new Set(ids).size).toBe(1006);
    expect(ids).toEqual(json(`select json_agg(m.id order by m.id) from public.meal_entries m join public.day_logs l on l.id=m.day_log_id where ${where}`));
    expect(pages[0]!.rows[0]!.day_logs).toEqual({ log_date: expect.any(String) });
    const nutrient = (column: string) => `json_build_object('recorded',coalesce(sum(m.${column}),0),'missing',count(*) filter(where m.${column} is null))`;
    const days = json(`select json_agg(row_to_json(d) order by date desc) from (select l.log_date date,count(*) "activeMeals",${nutrient('final_calories')} calories,${nutrient('final_protein_g')} "proteinG",${nutrient('final_carbs_g')} "carbsG",${nutrient('final_fat_g')} "fatG" from public.meal_entries m join public.day_logs l on l.id=m.day_log_id where ${where} group by l.log_date) d`);
    const detail = periodNutritionDetail(meals, TODAY, AS_OF, 'local', 2); expect(detail.days).toEqual(days); expect(detail.daysWithoutMeals).toBe(86);
    expect(detail.days.find(d => d.date === '2026-09-15')!.proteinG.missing).toBeGreaterThan(0);
    expect(detail.days.find(d => d.date === '2026-09-16')!.proteinG).toEqual({ recorded: 0, missing: 1 });
    expect(detail.days.find(d => d.date === '2026-09-17')!.calories).toEqual({ recorded: 0, missing: 0 });
    expect(sql(`select count(*) from public.workout_sessions s join public.day_logs l on l.id=s.day_log_id where s.user_id='${OWNER}' and l.log_date in ('2026-09-15','2026-09-16','2026-09-17')`)).toBe('0');
    expect(parsePerformanceInsights(plain(detail))).toBeDefined();
    for (const [identity, userId] of [[OTHER, OWNER], [OWNER, OTHER]]) expect(await readPeriodMeals(clientFor(identity!).context(userId), AS_OF)).toEqual([]);
    expect(await readPeriodMeals(clientFor(OTHER).context(), AS_OF)).toHaveLength(1);
    mock.auth.mockResolvedValue(who.context()); const response = await route('period-nutrition'), body = await response.json();
    expect(response.status).toBe(200); expect(parsePerformanceInsights(body)).toBeDefined(); expect(body.days).toEqual(days);
    console.log(JSON.stringify({ view: 'period-nutrition', meals: meals.length, dates: days.length, pages: pages.length, bytes: Buffer.byteLength(JSON.stringify(body)) }));
  }, 120_000);

  it('restarts the exact route reading when the real transactional counter changes between pages', async () => {
    let changed = false;
    const who = clientFor(OWNER, trace => {
      if (trace.table === 'meal_entries' && !changed) {
        changed = true;
        sql(`update public.meal_entries set final_protein_g=123 where id='${trace.rows[0]!.id}'`);
      }
    });
    mock.auth.mockResolvedValue(who.context()); const response = await route('period-nutrition'), body = await response.json();
    expect(response.status).toBe(200); expect(who.traces.filter(t => t.table === 'insights_source_revisions')).toHaveLength(4);
    expect(who.traces.filter(t => t.table === 'meal_entries')).toHaveLength(4);
    expect(parsePerformanceInsights(body)).toBeDefined();
    const expected = periodNutritionDetail(await readPeriodMeals(clientFor(OWNER).context(), AS_OF), TODAY, AS_OF, body.sourceRevision, 2);
    expect(body).toEqual(expected);
  }, 120_000);
  it('publishes temporal context through the exact canonical paginated reader, with SQL posterior totals', async () => {
    sql(`insert into public.meal_entries(user_id,day_log_id,source_type,consumed_at,consumed_at_source,final_calories,final_protein_g,final_carbs_g,final_fat_g)
      select '${OWNER}',id,'sheet_import',at::timestamptz,provenance,kcal,protein,carbs,fat from public.day_logs
      cross join (values ('2026-08-03T20:00:00-03:00','user_declared',150,0,null::numeric,2),('2026-08-03T21:00:00-03:00','user_declared',0,0,0,0),('2026-08-03T22:00:00-03:00','user_declared',900,90,90,90),('2026-08-03T20:30:00-03:00','default_clock',999,99,99,99)) v(at,provenance,kcal,protein,carbs,fat)
      where user_id='${OWNER}' and log_date='2026-08-03';`);
    const who=clientFor(OWNER);mock.auth.mockResolvedValue(who.context());
    const response=await GET(new NextRequest('http://localhost/api/mobile/v1/progress/performance-insights?view=session-temporal&method=2&date=2026-08-03',{headers:{authorization:'Bearer synthetic-not-a-token'}})),body=await response.json();
    expect(response.status).toBe(200);expect(parsePerformanceInsights(body)).toBeDefined();expect(body.sessions).toHaveLength(51);
    const truth=json(`select json_build_object('recorded',sum(m.final_calories),'missing',count(*) filter(where m.final_calories is null)) from public.meal_entries m where m.user_id='${OWNER}' and m.deleted_at is null and m.entry_kind='meal' and m.consumed_at_source='user_declared' and m.consumed_at>='2026-08-03T19:00:00-03:00' and m.consumed_at<'2026-08-03T22:00:00-03:00'`);
    for(const session of body.sessions){expect(session.post.knownMeals).toBe(2);expect(session.post.uncertainMeals).toBe(1);expect(session.post.nutrients.calories).toEqual(truth);expect(session.post.nutrients.carbsG).toEqual({recorded:0,missing:1});}
    expect(who.traces.filter(t=>t.table==='meal_entries')).toHaveLength(2);expect(who.traces.filter(t=>t.table==='insights_source_revisions')).toHaveLength(2);
    console.log(JSON.stringify({view:'session-temporal',queries:who.traces.length,sessions:body.sessions.length,bytes:Buffer.byteLength(JSON.stringify(body))}));
    mock.auth.mockResolvedValue(clientFor(OTHER).context(OWNER));
    const other=await GET(new NextRequest('http://localhost/api/mobile/v1/progress/performance-insights?view=session-temporal&method=2&date=2026-08-03',{headers:{authorization:'Bearer synthetic-not-a-token'}}));expect((await other.json()).sessions).toEqual([]);
  },120_000);
  it('publishes weekly exploration under one revision with SQL body and nutrient references and all empty calendar days',async()=>{
    sql(`update public.day_logs set weight_kg=case log_date when '2026-08-03' then 80 when '2026-08-05' then 79 else 78 end where user_id='${OWNER}' and log_date in ('2026-08-03','2026-08-05','2026-08-07');`);
    const who=clientFor(OWNER);mock.auth.mockResolvedValue(who.context());const response=await route('period-explore'),body=await response.json();
    expect(response.status).toBe(200);expect(parsePerformanceInsights(body)).toBeDefined();const days=body.weeks.flatMap((w:{days:unknown[]})=>w.days);expect(days).toHaveLength(92);
    const week=body.weeks.find((w:{start:string})=>w.start==='2026-08-03');
    const median=Number(sql(`select percentile_cont(0.5) within group(order by weight_kg) from public.day_logs where user_id='${OWNER}' and log_date between '2026-08-03' and '2026-08-09' and weight_kg>0`));
    expect(week.weight.median).toBe(median);expect(week.weight.weighIns).toHaveLength(3);
    const food=body.weeks.flatMap((w:{days:{date:string,nutrition:{calories:{recorded:number}}}[]})=>w.days).find((d:{date:string})=>d.date==='2026-09-15');
    const total=Number(sql(`select sum(final_calories) from public.meal_entries m join public.day_logs l on l.id=m.day_log_id where m.user_id='${OWNER}' and m.deleted_at is null and l.log_date='2026-09-15'`));expect(food.nutrition.calories.recorded).toBe(total);
    expect(who.traces.filter(t=>t.table==='meal_entries')).toHaveLength(2);expect(who.traces.filter(t=>t.table==='insights_source_revisions')).toHaveLength(2);
    console.log(JSON.stringify({view:'period-explore',queries:who.traces.length,days:days.length,bytes:Buffer.byteLength(JSON.stringify(body))}));
  },120_000);
});
