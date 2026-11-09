import {descriptiveCarbsBeforeSession} from './exposures';
import { coincidenceWeeks } from "./descriptive-weeks";
import { median } from "../body-evolution/weekly";
import { instantMs } from "./source-adapter";
import { postFact, POST_CAPTURE_GRACE_HOURS } from "./feeling-outcomes";
import type { createInsightsSnapshot } from "./read-model";
import type { InsightsSource, SessionFact } from "./types";

export const COINCIDENCE_METHOD = "insights-coincidences/1" as const;
type Snapshot = ReturnType<typeof createInsightsSnapshot>;
type Week = import("./descriptive-weeks").CoincidenceWeek;
type Post = { state: "recorded" | "before_end" | "late" | "unknown_time" | "not_recorded" | "unreadable" | "other_instrument"; value: number | null };
const BANDS = ["morning", "midday", "afternoon", "night"] as const;
const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", hourCycle: "h23" });
function bandOf(at: string | null) {
  if (instantMs(at) === null) return null;
  const h = Number(hour.format(new Date(at!)));
  return BANDS[h >= 5 && h < 11 ? 0 : h >= 11 && h < 15 ? 1 : h >= 15 && h < 20 ? 2 : 3]!;
}
function postOf(facts: unknown, key: "energyPost" | "fatiguePost", endedAt: string | null): Post {
  const fact = postFact(facts, key);
  if (fact.state !== "answered") return { state: fact.state, value: null };
  const end = instantMs(endedAt);
  const state = fact.capturedAt === null || end === null ? "unknown_time" : fact.capturedAt < end ? "before_end"
    : fact.capturedAt > end + POST_CAPTURE_GRACE_HOURS * 3_600_000 ? "late" : "recorded";
  return { state, value: state === "recorded" ? fact.value : null };
}
function ordinal(rows: { post: { energy: Post; fatigue: Post } }[], kind: "energy" | "fatigue") {
  const posts = [0, 0, 0, 0, 0], exclusions: Record<string, number> = {};
  for (const row of rows) { const p = row.post[kind]; if (p.state === "recorded") posts[p.value! - 1]!++; else exclusions[p.state] = (exclusions[p.state] ?? 0) + 1; }
  return { posts, eligible: posts.reduce((a, b) => a + b, 0), total: rows.length, exclusions };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const cutOf = (values: number[]) => values.length ? median(values) : null;
const side = (value: number | null, cut: number | null) => value === null || cut === null ? null : value <= cut ? "lower" as const : "upper" as const;
function routines(rows: { routineId: string | null; routineName: string | null }[]) {
  const groups = new Map<string, { id: string | null; name: string | null; sessions: number }>();
  for (const row of rows) { const key = row.routineId ?? "unknown", previous = groups.get(key); if (previous) previous.sessions++; else groups.set(key, { id: row.routineId, name: row.routineName, sessions: 1 }); }
  return [...groups.values()].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
}
const countsOf = (rows: { strict: SessionFact["counts"] }[]) => {
  const keys = ["improved", "observedStable", "declined", "ambiguous", "insufficient", "comparable", "total"] as const;
  return Object.fromEntries(keys.map(key => [key, sum(rows.map(row => row.strict[key]))])) as Record<typeof keys[number], number>;
};
const partialOf = (rows: { partial: Snapshot["partialDays"][number]["sessions"][number]["counts"] | null }[]) => {
  const keys = ["higher", "same", "lower", "ambiguous", "insufficient", "comparable", "total"] as const;
  return Object.fromEntries(keys.map(key => [key, sum(rows.map(row => row.partial?.[key] ?? 0))])) as Record<typeof keys[number], number>;
};

type FoodValue={value:number|null;state:string};
const recordedWindow=(w:{value:number|null;state:string}|undefined):FoodValue=>({value:w?.state==='recorded'&&w.value!==null&&Number.isFinite(w.value)&&w.value>=0?w.value:null,state:w?.state==='recorded'&&!(w.value!==null&&Number.isFinite(w.value)&&w.value>=0)?'invalid':w?.state??'unavailable'});
/** Counts peers by actual instants, including adjacent-period sessions; unknown is never zero. */
function overlaps(sessions:InsightsSource['sessions'],hours:number) {
  const sorted=sessions.flatMap(s=>{const at=instantMs(s.startedAt);return at===null?[]:[{id:s.id,at}];}).sort((a,b)=>a.at-b.at);
  const result=new Map<string,number>();let left=0,right=0;
  for(let i=0;i<sorted.length;i++) {
    const row=sorted[i]!;while(sorted[left]!.at<=row.at-hours*3_600_000)left++;
    right=Math.max(right,i);while(right+1<sorted.length&&sorted[right+1]!.at<row.at+hours*3_600_000)right++;
    result.set(row.id,right-left);
  }
  return result;
}
/** Fixed descriptive inventory. No hypothesis/candidate evaluator, data-dependent search, ranking of differences or public association. */
export function descriptiveCoincidences(source: InsightsSource, snapshot: Snapshot, weeks: readonly Week[], period: { start: string; end: string }) {
  const strict = new Map(snapshot.days.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const partial = new Map(snapshot.partialDays.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const facts = new Map(source.feelings.map(row => [row.sessionId, row.facts]));
  const completed=source.sessions.filter(s=>s.status==='completed'),overlap3=overlaps(completed,3),overlap12=overlaps(completed,12),byDate=new Map<string,number>();
  for(const s of completed)if(s.date)byDate.set(s.date,(byDate.get(s.date)??0)+1);
  const mealsByDate=new Map<string,InsightsSource['meals'][number][]>();for(const m of source.meals){const xs=mealsByDate.get(m.date)??[];xs.push(m);mealsByDate.set(m.date,xs);}
  const rows = source.sessions.filter(s => s.status === "completed" && s.date && s.date >= period.start && s.date <= period.end).map(s => {
    const fact = strict.get(s.id),protein=recordedWindow(fact?.context.preStart?.proteinG),start=instantMs(s.startedAt),last=fact?.context.preStart?.lastExplicitMeal;
    const lastMeal:FoodValue=!last?{state:'unavailable',value:null}:last.untimedInScope?{state:'untimed_meal_in_scope',value:null}:last.unverifiedInScope?{state:'unverified_meal_time_in_scope',value:null}:last.state!=='recorded'?{state:last.state,value:null}:last.hours!==null&&Number.isFinite(last.hours)&&last.hours>0&&last.hours<=12?{state:'recorded',value:last.hours}:{state:'invalid',value:null};
    return { id: s.id, date: s.date!, name: s.routineName ?? s.name ?? "Sesión", routineId: s.routineId, routineName: s.routineName, startedAt: s.startedAt,
      protein,preMeal:{calories:recordedWindow(fact?.context.preStart?.calories),carbs:recordedWindow(descriptiveCarbsBeforeSession(mealsByDate,s.date!,start)),lastMeal},
      concurrency:{sameDaySessions:byDate.get(s.date!)??1,overlap3h:overlap3.get(s.id)??null,overlap12h:overlap12.get(s.id)??null},band: bandOf(s.startedAt),
      strict: fact?.counts ?? { improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, comparable: 0, total: 0, coverage: null },
      partial: partial.get(s.id)?.counts ?? null, post: { energy: postOf(facts.get(s.id), "energyPost", s.endedAt), fatigue: postOf(facts.get(s.id), "fatiguePost", s.endedAt) } };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const food=(kind:'protein'|'calories'|'carbs'|'lastMeal')=>{
    const valueOf=(row:typeof rows[number])=>kind==='protein'?row.protein:row.preMeal[kind];
    const eligible=rows.filter(row=>valueOf(row).value!==null),cut=kind==='lastMeal'?null:cutOf(eligible.map(row=>valueOf(row).value!));
    const keys=kind==='lastMeal'?['within1h','oneTo3h','over3h'] as const:['lower','upper'] as const;
    const groupOf=(value:number|null)=>value===null?null:kind==='lastMeal'?(value<=1?'within1h':value<=3?'oneTo3h':'over3h'):side(value,cut);
    const groups=keys.map(key=>{const selected=rows.filter(row=>groupOf(valueOf(row).value)===key),strictRows=selected.filter(row=>row.strict.comparable>0),partialRows=selected.filter(row=>(row.partial?.comparable??0)>0);
      return {key,ids:selected.map(row=>row.id),sessions:selected.length,days:new Set(selected.map(r=>r.date)).size,strict:countsOf(selected),partial:partialOf(selected),strictSessions:strictRows.length,partialSessions:partialRows.length,strictDays:new Set(strictRows.map(r=>r.date)).size,partialDays:new Set(partialRows.map(r=>r.date)).size,routines:routines(selected)};});
    const exclusions:Record<string,number>={};for(const row of rows)if(valueOf(row).value===null){const reason=valueOf(row).state;exclusions[reason]=(exclusions[reason]??0)+1;}
    const strictReady=groups.filter(g=>g.strictSessions>=3).length>=2,partialReady=groups.filter(g=>g.partialSessions>=3).length>=2;
    const constant=eligible.length>0&&new Set(eligible.map(r=>valueOf(r).value)).size===1;
    const contrast=eligible.length===0?'no_data':constant?'constant':groups.filter(g=>g.sessions>0).length<2?'empty_group':strictReady||partialReady?'available':'too_few_comparable';
    return {cut,total:rows.length,eligible:eligible.length,totalDays:new Set(rows.map(r=>r.date)).size,eligibleDays:new Set(eligible.map(r=>r.date)).size,multiSessionDays:new Set(rows.filter(r=>r.concurrency.sameDaySessions>1).map(r=>r.date)).size,overlappingSessions:rows.filter(r=>(kind==='lastMeal'?r.concurrency.overlap12h:r.concurrency.overlap3h)!>0).length,unknownOverlapSessions:rows.filter(r=>r.concurrency.overlap3h===null).length,groups,exclusions,status:strictReady||partialReady?'described' as const:'insufficient' as const,contrast,strictReady,partialReady};
  };
  const protein=food('protein'),preMeal={calories:food('calories'),carbs:food('carbs'),lastMeal:food('lastMeal')};
  const timingGroups = BANDS.map(key => {
    const selected = rows.filter(row => row.band === key);
    return { key, ids: selected.map(row => row.id), sessions: selected.length, energy: ordinal(selected, "energy"), fatigue: ordinal(selected, "fatigue"), routines: routines(selected) };
  });
  const weekRows = coincidenceWeeks(weeks);
  const weekCut = cutOf(weekRows.flatMap(row => row.proteinPerRecordedDay === null ? [] : [row.proteinPerRecordedDay]));
  const bodyGroups = (["lower", "upper"] as const).map(key => {
    const selected = weekRows.filter(row => side(row.proteinPerRecordedDay, weekCut) === key), eligible = selected.filter(row => row.change !== null);
    return { key, starts: selected.map(row => row.start), weeks: selected.length, eligible: eligible.length,
      increased: eligible.filter(row => row.change! > 0).length, same: eligible.filter(row => row.change === 0).length, decreased: eligible.filter(row => row.change! < 0).length,
      completeDays: sum(selected.map(row => row.completeDays)), partialDays: sum(selected.map(row => row.partialDays)), unknownDays: sum(selected.map(row => row.unknownDays)) };
  });
  return { methodVersion: COINCIDENCE_METHOD, claim: "descriptive_only" as const, sessionRows: rows, weekRows,
    protein,preMeal,
    timing: { groups: timingGroups, total: rows.length, unknownStart: rows.filter(row => row.band === null).length,
      energyReady: timingGroups.filter(g => g.energy.eligible >= 3).length >= 2, fatigueReady: timingGroups.filter(g => g.fatigue.eligible >= 3).length >= 2 },
    body: { cut: weekCut, groups: bodyGroups, total: weekRows.length, excludedNutrition: weekRows.filter(row => row.proteinPerRecordedDay === null).length,
      status: bodyGroups.every(group => group.eligible >= 2) ? "described" as const : "insufficient" as const },
  };
}
export type DescriptiveCoincidences = ReturnType<typeof descriptiveCoincidences>;
