import { useMemo } from 'react';
import type { MobileApiClient } from '@/api/client';
import { confirmedReads, scopedReadKey } from '@/api/confirmed-read-cache';
import { fetchHistoryRange } from '@/api/history';
import { fetchNutritionReport, reportQueryKey } from '@/api/nutrition-report';
import { fetchProgressFindings, progressRequestKey } from '@/api/progress';
import { fetchProgressViews } from '@/api/progress-views';
import { useCachedRead } from '@/api/use-cached-read';
import { nutritionToday } from '@/nutrition/day-format';
import { addDays } from './progress-range';

export const panoramaQuery = (today: string) => ({ period: 'custom' as const, from: addDays(today, -29), to: today });

function panoramaReads(today: string) {
  const query = panoramaQuery(today);
  return {
    query,
    findingsKey: `panorama-v2|${query.from}|${today}`,
    historyKey: `panorama-calendar|${query.from}|${today}`,
    reportKey: reportQueryKey(query),
    findings: (client: MobileApiClient, signal: AbortSignal, background?: boolean) => fetchProgressFindings(client, query, signal, background),
    history: (client: MobileApiClient, signal: AbortSignal, background?: boolean) => fetchHistoryRange(client, { from: query.from, to: today }, signal, background),
    report: (client: MobileApiClient, signal: AbortSignal, background?: boolean) => fetchNutritionReport(client, query, signal, background),
  };
}

export function usePanoramaReads(client: MobileApiClient | null, today: string) {
  const reads = useMemo(() => panoramaReads(today), [today]);
  const summary = useCachedRead(client, 'overview', reads.findingsKey, reads.findings);
  const history = useCachedRead(client, 'overview', reads.historyKey, reads.history);
  const report = useCachedRead(client, 'nutrition-report', reads.reportKey, reads.report);
  return { summary, history, report, query: reads.query };
}

/** Queues the same reads the portada will mount, at background priority and one at a time. */
export function prefetchPanorama(client: MobileApiClient, today: string) {
  const cache = confirmedReads(client);
  const scope = nutritionToday();
  const reads = panoramaReads(today);
  const stops = [
    cache.prefetch([cache.get('overview', scopedReadKey(reads.findingsKey, scope), (signal, background) => reads.findings(client, signal, background))]),
    cache.prefetch([cache.get('overview', scopedReadKey(reads.historyKey, scope), (signal, background) => reads.history(client, signal, background))]),
    cache.prefetch([cache.get('nutrition-report', scopedReadKey(reads.reportKey, scope), (signal, background) => reads.report(client, signal, background))]),
    cache.prefetch([cache.get('progress-extra', scopedReadKey(`views|${progressRequestKey(reads.query)}`, scope),
      (signal, background) => fetchProgressViews(client, reads.query, signal, null, background))]),
  ];
  return () => { for (const stop of stops) stop(); };
}
