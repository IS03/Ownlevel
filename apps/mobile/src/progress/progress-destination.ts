import type { ProgressDestination } from '@/api/progress';
export type ProgressRoute = '/(tabs)/progress/trends/body' | '/(tabs)/progress/trends/metrics' | '/(tabs)/progress/trends/nutrition' | '/(tabs)/progress/trends/training' | '/(tabs)/progress/trends/exercise/[id]';
export function destinationRoute(d: ProgressDestination): {
    pathname: ProgressRoute;
    extra: Record<string, string>;
} {
    if (d.kind === 'body')
        return { pathname: '/(tabs)/progress/trends/body', extra: {} };
    if (d.kind === 'nutrition')
        return { pathname: '/(tabs)/progress/trends/nutrition', extra: {} };
    if (d.kind === 'training')
        return { pathname: '/(tabs)/progress/trends/training', extra: {} };
    if (d.kind === 'training_exercise')
        return { pathname: '/(tabs)/progress/trends/exercise/[id]', extra: { id: d.exerciseId } };
    return { pathname: '/(tabs)/progress/trends/metrics', extra: d.metricId ? { metric: d.metricId } : {} };
}
