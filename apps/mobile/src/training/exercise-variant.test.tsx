import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { ExerciseConfigurationJournal } from '@/api/training-exercise-configuration';
import type { ConfigurationInput, ConfigurationValue, ConfigurationsResponse } from '../../../../src/lib/mobile-api/training-exercise-configuration-contract';
import { ExerciseVariantRow, SessionVariants, variantsAttention } from './exercise-variant';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));
jest.mock('@/design-system/app-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Context = React.createContext<() => void>(() => {});
  return { AppSheet: ({ children, onClose, testID }: { children: React.ReactNode; onClose: () => void; testID: string }) => <Context.Provider value={onClose}><View testID={testID}>{children}</View></Context.Provider>,
    useAppSheetDismiss: () => { const close = React.useContext(Context); return (after?: () => void) => { close(); after?.(); }; } };
});

const SESSION = '93671000-0000-4000-8000-000000000021', PRESS = '93671000-0000-4000-8000-000000000031', EARLIER = '93671000-0000-4000-8000-000000000030';
type Phase = 'during_session' | 'after_session';
const read = (revision: number, value: ConfigurationValue | null, previous = true, recordedPhase: Phase = 'during_session', extra: ConfigurationsResponse['items'] = []): ConfigurationsResponse => ({
  contractVersion: 'training-exercise-configuration/1', sessionId: SESSION, sessionStatus: 'in_progress',
  items: [{ sessionExerciseId: PRESS, exerciseId: '93671000-0000-4000-8000-000000000010', revision, value: value && { ...value, recordedPhase },
    previous: previous ? { sessionExerciseId: EARLIER, sessionId: '93671000-0000-4000-8000-000000000020', endedAt: '2026-11-01T11:00:00+00:00', value: { kind: 'recorded', label: 'Agarre neutro' } } : null }, ...extra],
});
function setup(initial = read(0, null)) {
  const values = new Map<string, string>(), writes: ConfigurationInput[] = [];
  let server = initial;
  const journal = new ExerciseConfigurationJournal({ getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } },
    { read: async () => ({ status: 'ok', data: server }), write: async body => { writes.push(body); server = read(body.expectedRevision + 1, body.value); return { status: 'ok', data: server }; } },
    'owner', SESSION, () => `synthetic:${writes.length}`);
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><ExerciseVariantRow journal={journal} sessionExerciseId={PRESS} name="Press inclinado" editable /></OwnlevelThemeProvider></SafeAreaProvider>);
  return { journal, view, writes };
}

describe('optional exercise variant', () => {
  it('starts unknown, never prefilled, and offers the last one as an explicit choice with its origin', async () => {
    const { journal, view, writes } = setup();
    await act(async () => { await journal.refresh(); });
    expect(view.getByText('Variante · Sin registrar')).toBeTruthy();
    fireEvent.press(view.getByText('Registrar'));
    expect(view.getByTestId('exercise-variant-input').props.value).toBe('');
    fireEvent.press(view.getByText('Como la última vez · Agarre neutro'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.value).toEqual({ kind: 'recorded', label: 'Agarre neutro', source: 'repeated_previous', repeatedFrom: EARLIER });
    await waitFor(() => expect(view.getByText('Variante · Agarre neutro')).toBeTruthy());
    expect(view.queryByTestId('exercise-variant-sheet')).toBeNull();
  });
  it('saves a typed variant, marks one that does not apply, and clears only on purpose', async () => {
    const { journal, view, writes } = setup(read(0, null, false));
    await act(async () => { await journal.refresh(); });
    fireEvent.press(view.getByText('Registrar'));
    expect(view.queryByText(/Como la última vez/)).toBeNull();
    fireEvent.changeText(view.getByTestId('exercise-variant-input'), '  banco   a 30° ');
    fireEvent.press(view.getByText('Guardar'));
    await waitFor(() => expect(view.getByText('Variante · banco a 30°')).toBeTruthy());
    fireEvent.press(view.getByText('Cambiar'));
    fireEvent.press(view.getByText('No aplica'));
    await waitFor(() => expect(view.getByText('Variante · No aplica')).toBeTruthy());
    fireEvent.press(view.getByText('Cambiar'));
    fireEvent.press(view.getByText('Dejar sin registrar'));
    await waitFor(() => expect(view.getByText('Variante · Sin registrar')).toBeTruthy());
    expect(writes.map(body => body.value?.kind ?? null)).toEqual(['recorded', 'not_applicable', null]);
    expect(writes.map(body => body.expectedRevision)).toEqual([0, 1, 2]);
  });
  it('shows nothing that blocks training when the read is not available', async () => {
    const journal = new ExerciseConfigurationJournal({ getItem: async () => null, setItem: async () => undefined },
      { read: async () => ({ status: 'unavailable' }), write: async () => ({ status: 'unavailable' }) }, 'owner', SESSION, () => 'k');
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><ExerciseVariantRow journal={journal} sessionExerciseId={PRESS} name="Press" editable /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => { await journal.refresh(); });
    expect(view.getByText('Variante no disponible por ahora')).toBeTruthy();
    expect(view.queryByText('Registrar')).toBeNull();
  });
  it('#475: only an unconfirmed write, a failed read, a conflict or a refused write needs attention outside a folded section', () => {
    const base = { version: 1 as const, server: null, pending: null, ready: true, busy: false, error: null };
    const server = read(1, null), pending = { contractVersion: 'training-exercise-configuration/1' as const, sessionExerciseId: PRESS, expectedRevision: 1, value: null, idempotencyKey: 'k' };
    expect(variantsAttention({ ...base, ready: false, error: 'x' })).toBeNull();
    expect(variantsAttention({ ...base, server })).toBeNull();
    // In flight: it settles into a confirmed value or into one of the states below.
    expect(variantsAttention({ ...base, server, pending, busy: true })).toBeNull();
    expect(variantsAttention({ ...base, server, pending })).toEqual({ message: 'Variante sin confirmar.', retry: true, reread: false, review: true });
    expect(variantsAttention({ ...base, error: 'No pudimos leer las variantes. Podés seguir entrenando.' }))
      .toEqual({ message: 'No pudimos leer las variantes. Podés seguir entrenando.', retry: false, reread: true, review: false });
    expect(variantsAttention({ ...base, server, error: 'La variante cambió en otro lugar.' })).toEqual({ message: 'La variante cambió en otro lugar.', retry: false, reread: true, review: true });
  });
  it('on a completed session, says a variant was recorded afterwards, and warns when two blocks differ', async () => {
    const second = '93671000-0000-4000-8000-000000000032';
    const other = { sessionExerciseId: second, exerciseId: '93671000-0000-4000-8000-000000000010', revision: 1,
      value: { kind: 'recorded' as const, label: 'Agarre prono', source: 'entered' as const, repeatedFrom: null, recordedPhase: 'after_session' as const }, previous: null };
    const journal = new ExerciseConfigurationJournal({ getItem: async () => null, setItem: async () => undefined },
      { read: async () => ({ status: 'ok', data: read(1, { kind: 'recorded', label: 'Agarre neutro', source: 'entered', repeatedFrom: null }, false, 'after_session', [other]) }), write: async () => ({ status: 'unavailable' }) }, 'owner', SESSION, () => 'k');
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><SessionVariants journal={journal} exercises={[{ id: PRESS, nameSnapshot: 'Press' }, { id: second, nameSnapshot: 'Press' }]} editable /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => { await journal.refresh(); });
    expect(view.getByText('Variante · Agarre neutro · registrada después')).toBeTruthy();
    expect(view.getAllByText('Este ejercicio está dos veces en la sesión con otra variante: así no se compara.')).toHaveLength(2);
    expect(view.getByText(/hace falta una sesión anterior con la misma variante/)).toBeTruthy();
    expect(view.queryByText(/compará|se compara ahora/)).toBeNull();
  });
});
