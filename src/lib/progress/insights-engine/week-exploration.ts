import { weeklyWeights, mondayOf, type WeighIn } from '../body-evolution/weekly';
import { createInsightsSnapshot } from './read-model';
import { buildExposureContext, weightOfDay } from './exposures';
import { describeFeelingOutcome, FEELING_OUTCOME_KINDS } from './feeling-outcomes';
import { periodDetailFrame } from './period-details';
import { describePriorFeelings, type PriorFeelingDescription } from './prior-feelings';
import type { InsightsSource, InsightsEngineMethod } from './types';
import { descriptiveCoincidences } from './descriptive-coincidences';

const shift = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0,10);
/** One bounded period projection. No hypothesis search: comparator facts, ordinal descriptions and body-weekly/1 only. */
export function periodExploration(source: InsightsSource, weights: readonly WeighIn[], today: string, asOf: string, revision: string, method: InsightsEngineMethod) {
  const frame = periodDetailFrame(today,asOf,revision,method), snapshot = createInsightsSnapshot(source,{today:asOf,revision,method});
  const context = buildExposureContext(source), strict = new Map(snapshot.days.map(d=>[d.date,d])), partial = new Map(snapshot.partialDays.map(d=>[d.date,d]));
  const body = weeklyWeights(weights,frame.period,today), weightByDate = new Map(weights.map(w=>[w.date,w.value]));
  const feelingFacts = new Map(source.feelings.map(row => [row.sessionId, row.facts]));
  const weeks = [];
  for(let weekStart=mondayOf(frame.period.start);weekStart<=frame.period.end;weekStart=shift(weekStart,7)) {
    const start=weekStart<frame.period.start?frame.period.start:weekStart, weekEnd=shift(weekStart,6), end=weekEnd>frame.period.end?frame.period.end:weekEnd;
    const days=[];
    for(let date=start;date<=end;date=shift(date,1)) {
      const training=strict.get(date), partialDay=partial.get(date);
      // The existing day reader owns session/exercise evidence. Do not repeat it for an entire quarter.
      days.push({date,training:training?{sessions:training.sessions.length,counts:training.counts}:null,
        partial:partialDay?{counts:partialDay.counts}:null,nutrition:context.nutritionByDate.get(date)??null,
        weight:weightOfDay(weightByDate.get(date)),metrics:context.metricsByDate.get(date)??[]});
    }
    const sessions=source.sessions.filter(s=>s.date && s.date>=start && s.date<=end);
    // Optional additive contract: installed clients ignore it; new clients can still read older servers.
    const prior: { priorFeelings?: PriorFeelingDescription[] } = { priorFeelings: describePriorFeelings(sessions, context, feelingFacts) };
    weeks.push({start,end,wholeWeek:start===weekStart&&end===weekEnd,days,
      ...prior,
      feelings:FEELING_OUTCOME_KINDS.map(kind=>describeFeelingOutcome({...source,sessions},kind,context,today)),
      weight:body.weeks.find(w=>w.start===weekStart)??null,weightChange:body.changes.find(w=>w.weekStart===weekStart)??null});
  }
  return {...frame,integrity:snapshot.integrity,view:'period-explore' as const,explorationMethodVersion:'insights-week-explore/1' as const,
    metrics:snapshot.metrics,weeks,associations:'not_computed' as const,
    ...(method===2?{coincidences:descriptiveCoincidences(source,snapshot,weeks,frame.period)}:{})};
}
export type PeriodExploration = ReturnType<typeof periodExploration>;
