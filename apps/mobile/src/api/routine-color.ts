import type { MobileRoutineColorKey } from './home';

export const MOBILE_ROUTINE_COLOR_KEYS: readonly MobileRoutineColorKey[] = [
  'violet', 'indigo', 'blue', 'cyan', 'green', 'yellow', 'orange', 'rose',
];

export function isKnownRoutineColor(value: unknown): value is MobileRoutineColorKey {
  return typeof value === 'string' && MOBILE_ROUTINE_COLOR_KEYS.includes(value as MobileRoutineColorKey);
}

/** Unknown string keys lose only their visual decoration, never their parent resource. */
export function parseRoutineColor(value: unknown): MobileRoutineColorKey | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return isKnownRoutineColor(value) ? value : null;
}
