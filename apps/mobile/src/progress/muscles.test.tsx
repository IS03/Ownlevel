import { describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { TrainingHistoryExercise } from '@/api/training-history';
import { defaultNoticePreferences, parseNoticePreferences } from '@/notices/notice-preferences';
import { MUSCLES, muscleFacts, muscleRemindersCategory } from '@/notices/muscle-reminders';
import { muscleRecency, recencyLabel } from './muscle-recency';
import { MusclesScreen } from './muscles-screen';

const TODAY = '2026-11-25';
const exercise = (id: string, muscleGroup: string | null, lastDate: string | null): TrainingHistoryExercise =>
  ({ id, name: id, muscleGroup, muscleLabel: null, implement: null, weightMode: 'Peso total', lastDate, sessions: lastDate ? 1 : 0, lastMark: null, bestMark: null });
const exercises = [exercise('press', 'pecho', '2026-11-24'), exercise('apertura', 'pecho', '2026-11-10'), exercise('sentadilla', 'piernas', '2026-11-12'),
  exercise('plancha', 'abdomen', null), exercise('otro', null, '2026-11-25')];
let mockState: unknown = { status: 'ready', data: exercises, stale: false };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: {} }) }));
jest.mock('@/training/use-read', () => ({ useFocusedRead: () => ({ state: mockState, reload: jest.fn() }) }));
jest.mock('@/home/home-day', () => ({ homeDay: () => ({ today: '2026-11-25', weekStart: '2026-11-24' }) }));
jest.mock('@/navigation/scroll-header-screen', () => ({ ScrollHeaderScreen: ({ children }: { children: unknown }) => children }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('Progreso → Músculos (#639)', () => {
  it('the last date with sets per group, the longest ago first; a group never with sets says so', () => {
    expect(muscleRecency(exercises)).toEqual([
      { group: 'piernas', label: 'Piernas', lastDate: '2026-11-12', exercises: 1 },
      { group: 'pecho', label: 'Pecho', lastDate: '2026-11-24', exercises: 2 },
      { group: 'abdomen', label: 'Abdomen', lastDate: null, exercises: 1 },
    ]);
    expect([recencyLabel('2026-11-25', TODAY), recencyLabel('2026-11-24', TODAY), recencyLabel('2026-11-12', TODAY), recencyLabel(null, TODAY)])
      .toEqual(['Hoy', 'Ayer', 'Hace 13 días', 'Sin series todavía']);
  });
  it('lists them', async () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><MusclesScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => {});
    expect(view.getByLabelText(/^Piernas: Hace 13 días/)).toBeTruthy(); expect(view.getByLabelText('Abdomen: Sin series todavía')).toBeTruthy();
    mockState = { status: 'unavailable' }; view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><MusclesScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
    expect(view.getByText('No pudimos cargar tus músculos')).toBeTruthy();
  });
});

describe('«Grupos musculares» reminder (#639)', () => {
  const plan = (setting: object, facts?: object) => muscleRemindersCategory.plan({ preferences: { ...defaultNoticePreferences, reminders: { [MUSCLES]: setting as never },
    ...(facts ? { facts } : {}) }, now: Date.parse('2026-11-25T11:00:00Z'), today: TODAY }).map(item => item.id);
  const setting = { enabled: true, hour: 18, minute: 0, afterDays: 7, groups: ['piernas', 'pecho'] };
  it('once a chosen group goes N days without sets, one grouped neutral reminder a day', () => {
    const facts = muscleFacts(exercises);
    expect(facts).toEqual({ muscles: { piernas: '2026-11-12', pecho: '2026-11-24', abdomen: null } });
    expect(plan(setting, facts)[0]).toBe('muscles.2026-11-25');
    expect(plan({ ...setting, groups: ['pecho'] }, facts)).toEqual(['muscles.2026-12-01']);
    // Never read, or a group not in the reading: nothing.
    expect(plan(setting)).toEqual([]);
    expect(plan({ ...setting, groups: ['hombros'] }, facts)).toEqual([]);
    expect(plan({ ...setting, groups: [] }, facts)).toEqual([]);
  });
  it('the facts and the chosen groups survive a restart', () => {
    const parsed = parseNoticePreferences({ facts: { muscles: { piernas: '2026-11-12', abdomen: null, bad: 'x' } }, reminders: { [MUSCLES]: setting } });
    expect(parsed.facts).toEqual({ muscles: { piernas: '2026-11-12', abdomen: null } });
    expect(parsed.reminders[MUSCLES]).toEqual(setting);
  });
});
