import type { MobileApiClient } from './client';
import { progressQueryString, type ProgressCompareRange, type ProgressPeriod, type ProgressQuery } from './progress';
import { resolveProgressPeriod } from '../../../../src/lib/progress/analytics/periods';
import { parseProgressInfluence, parseProgressInfluenceSuggested, type InfluenceDefinition } from '../../../../src/lib/mobile-api/progress-influence-contract';

export * from '../../../../src/lib/mobile-api/progress-influence-contract';
const BASE = '/api/mobile/v1/progress/influence';
const qs = (query: ProgressQuery, compare: ProgressCompareRange) => `${progressQueryString(query)}${compare ? `&compareFrom=${compare.start}&compareTo=${compare.end}` : ''}`;
export const influenceDefinitionKey = (d: InfluenceDefinition) => `${d.split}|${d.cut}|${d.lag}|${d.outcome}`;
function samePeriod(period: ProgressPeriod, today: string, query: ProgressQuery, compare: ProgressCompareRange) {
  const expected = resolveProgressPeriod({ preset: ({ '7': '1w', '14': '2w', '30': '30d' } as Record<string, string>)[query.period] ?? query.period, from: query.from, to: query.to }, today);
  return !expected.error && period.preset === query.period && period.start === expected.current.start && period.end === expected.current.end
    && (!compare || period.previousStart === compare.start && period.previousEnd === compare.end);
}
export const fetchProgressInfluence = (client: MobileApiClient, query: ProgressQuery, definition: InfluenceDefinition, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}?${qs(query, compare)}&${new URLSearchParams({ ...definition, lag: String(definition.lag) })}`, signal, parse: (raw: unknown) => {
    const data = parseProgressInfluence(raw);
    return data && samePeriod(data.period, data.today, query, compare) && (data.reference !== null) === !!compare
      && influenceDefinitionKey(data.definition) === influenceDefinitionKey(definition) ? data : undefined;
  } });
export const fetchProgressInfluenceSuggested = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/suggested?${qs(query, compare)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressInfluenceSuggested(raw);
    return data && samePeriod(data.period, data.today, query, compare) && data.questions.every(q => (q.reference !== null) === !!compare) ? data : undefined;
  } });
