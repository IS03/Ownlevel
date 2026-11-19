import * as ExpoRouter from 'expo-router';
import { useMemo } from 'react';

type Router = ReturnType<typeof ExpoRouter.useRouter>;
type Href = Parameters<Router['push']>[0];
type Options = Parameters<Router['push']>[1];

const TRAIN = '/(tabs)/train/insights', PROGRESS = '/(tabs)/progress/insights';

/** The same Comparaciones screen in Progreso's stack: only the prefix changes, never the params. */
export function insideProgress(href: Href, progress: boolean): Href {
  if (!progress) return href;
  const swap = (path: string) => path === TRAIN || path.startsWith(`${TRAIN}/`) ? PROGRESS + path.slice(TRAIN.length) : path;
  if (typeof href === 'string') return swap(href) as Href;
  if (href && typeof href === 'object' && 'pathname' in href && typeof href.pathname === 'string') return { ...href, pathname: swap(href.pathname) } as Href;
  return href;
}

/** Whether this screen is in Progreso's stack (opened from Progreso) rather than Entrenar's. */
export function useInProgressStack(): boolean {
  const segments = (ExpoRouter.useSegments?.() ?? []) as string[];
  return segments[1] === 'progress';
}

/**
 * Comparaciones and the three-month summary open from Entrenar and from Progreso. Opened from Progreso they stay in its stack (same
 * tab, native back) instead of jumping to Entrenar: every link inside them keeps that stack.
 */
export function useInsightsRouter(): Router {
  const router = ExpoRouter.useRouter();
  const progress = useInProgressStack();
  return useMemo(() => progress ? {
    ...router,
    push: (href: Href, options?: Options) => router.push(insideProgress(href, true), options),
    navigate: (href: Href, options?: Options) => router.navigate(insideProgress(href, true), options),
    replace: (href: Href, options?: Options) => router.replace(insideProgress(href, true), options),
  } : router, [router, progress]);
}
