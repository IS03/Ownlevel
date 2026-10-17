import type { MobileApiClient } from './client';
import { progressQueryParams, progressResponseMatches, type ProgressCompareRange, type ProgressQuery } from './progress';
import { parseProgressConnections } from '../../../../src/lib/mobile-api/progress-connections-contract';

export * from '../../../../src/lib/mobile-api/progress-connections-contract';

/** Connections always supplies its own previous equivalent B, independent of the comparison switch. */
export const fetchProgressConnections = (client: MobileApiClient, query: ProgressQuery, compare: NonNullable<ProgressCompareRange>, signal?: AbortSignal) =>
  client.read({ path: `/api/mobile/v1/progress/connections?${progressQueryParams(query, compare)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressConnections(raw);
    if (!data || !progressResponseMatches(data.period, query, compare)) return;
    const end = query.to && query.to < data.today ? query.to : data.today;
    return query.period !== 'custom' || data.period.end === end ? data : undefined;
  } });
