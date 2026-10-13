import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileTrainingExercise } from '@/api/exercises';
import { detailFixture } from '@/api/routine-editor.fixture';
import { ExerciseAddRoutineSheet } from './exercise-add-routine-sheet';
const mockRoutineId = detailFixture.routine.id;
const mockDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockReplace = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockRefresh = jest.fn<() => Promise<void>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-editor-sheet', () => ({ RoutineEditorSheet: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/api', () => ({ fetchMobileTrainingRoutines: jest.fn(), fetchRoutineDetail: (...args: unknown[]) => mockDetail(...args), replaceRoutineTemplate: (...args: unknown[]) => mockReplace(...args),
  useApiResource: () => ({ refresh: mockRefresh, state: { status: 'ready', refreshing: false, current: { data: { routines: { status: 'ok', data: [{ id: mockRoutineId, name: 'PUSH', isActive: true }] } } } } }) }));
const exercise: MobileTrainingExercise = { id: '99999999-9999-4999-8999-999999999999', name: 'Nuevo', isActive: true, routineIds: [], updatedAt: '2026-10-13T12:00:00Z', muscleGroup: null, muscleGroupLabel: null, implement: null, weightMode: null,
  suggestedSets: 5, suggestedReps: 10, suggestedWeight: 55, suggestedRir: 2, suggestedRestMinSeconds: 90, suggestedRestMaxSeconds: 120, notes: 'Nota de catálogo' };
beforeEach(() => { mockDetail.mockReset(); mockReplace.mockReset(); mockRefresh.mockReset(); mockRefresh.mockResolvedValue(undefined); mockDetail.mockResolvedValue({ status: 'ok', data: { kind: 'detail', detail: detailFixture } }); });
function setup(selected = exercise) {
  const onClose = jest.fn(), onChanged = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const view = render(<OwnlevelThemeProvider initialMode="light"><ExerciseAddRoutineSheet client={{ request: jest.fn() } as never} exercise={selected} onClose={onClose} onChanged={onChanged} /></OwnlevelThemeProvider>);
  return { ...view, onClose, onChanged };
}
it('adds one empty set with the freshly read template version and preserves existing exercises', async () => {
  mockReplace.mockResolvedValue({ status: 'ok' }); const view = setup(); await act(async () => fireEvent.press(view.getByRole('button', { name: 'PUSH' })));
  const payload = mockReplace.mock.calls[0]?.[2] as { expectedTemplateVersion: number; items: { targets: unknown }[] };
  expect(payload.expectedTemplateVersion).toBe(3); expect(payload.items).toHaveLength(2);
  expect(payload.items[0]?.targets).toEqual(detailFixture.items[0]!.targets);
  expect(payload.items[1]?.targets).toEqual({ nextAdjustment: 'maintain', nextAdjustmentNote: null, notes: null, restMinSeconds: null, restMaxSeconds: null,
    sets: [{ setNumber: 1, targetWeightKg: null, targetReps: null, targetRir: null, notes: null }] }); expect(view.onClose).toHaveBeenCalled();
});
it('rereads after a template conflict without automatically retrying the write', async () => {
  mockReplace.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_TEMPLATE_CHANGED' }); const view = setup(); await act(async () => fireEvent.press(view.getByRole('button', { name: 'PUSH' })));
  expect(mockReplace).toHaveBeenCalledTimes(1); expect(mockRefresh).toHaveBeenCalled(); expect(view.onChanged).toHaveBeenCalled(); expect(view.onClose).not.toHaveBeenCalled(); expect(view.getByText(/La rutina cambió/)).toBeTruthy();
});
it('does not add when the latest detail already contains it', async () => {
  const view = setup({ ...exercise, id: detailFixture.items[0]!.exercise.id }); await act(async () => fireEvent.press(view.getByRole('button', { name: 'PUSH' })));
  expect(mockReplace).not.toHaveBeenCalled(); expect(view.getByText('El ejercicio ya está en esta rutina.')).toBeTruthy();
});

it('keeps a confirmed add successful when the subsequent catalog refresh fails', async () => {
  mockReplace.mockResolvedValue({ status: 'ok' }); const view = setup(); view.onChanged.mockRejectedValue(new Error('Offline'));
  await act(async () => fireEvent.press(view.getByRole('button', { name: 'PUSH' })));
  expect(view.onClose).toHaveBeenCalled(); expect(mockReplace).toHaveBeenCalledTimes(1); expect(view.queryByText(/No pudimos confirmar/)).toBeNull();
});
