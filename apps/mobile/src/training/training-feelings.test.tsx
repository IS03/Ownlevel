import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, LayoutAnimation, Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { withTiming } from 'react-native-reanimated';
import { OwnlevelThemeProvider } from '@/design-system';
import { TrainingFeelingsJournal } from '@/api/training-feelings';
import { TrainingFeelings } from './training-feelings';
import type { ActiveSessionController } from './active-session-controller';
import { RecordedTrainingFeelings } from './recorded-training-feelings';
const mockTrigger = jest.fn();
jest.mock('@/platform/haptics', () => ({ triggerHaptic: (event: string) => mockTrigger(event), haptics: { selection: jest.fn() } }));
const sid = '93670000-0000-4000-8000-000000000010';
function setup() {
  const values = new Map<string, string>();
  const journal = new TrainingFeelingsJournal({ getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } },
    { read: async () => ({ status: 'ok', data: { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-04T10:00:00Z', endedAt: null, revision: 0, values: {} } }), write: async () => ({ status: 'unavailable' }) }, 'owner', sid, 'mobile', () => 'synthetic:1');
  return journal;
}
describe('native optional feeling controls', () => {
  it('starts without defaults, announces anchors, and persists independent choices and explicit removal', async () => {
    const journal = setup(); await journal.refresh();
    const view = render(<OwnlevelThemeProvider><TrainingFeelings phase="post" journal={journal} controller={{} as ActiveSessionController} /></OwnlevelThemeProvider>);
    expect(view.getAllByRole('radio').every(radio => radio.props.accessibilityState.selected === false)).toBe(true);
    fireEvent.press(view.getByLabelText('Energía: Muy alta, 5 de 5'));
    await waitFor(() => expect(journal.value('energyPost')).toBe(5));
    await act(async () => { await journal.change('fatiguePost', 1); });
    expect(journal.value('fatiguePost')).toBe(1); expect(view.getByLabelText('Fatiga: Ninguna, 1 de 5')).toBeTruthy();
    // No separate remove button: tapping the chosen value again leaves it unanswered.
    expect(view.queryByLabelText('Quitar energía')).toBeNull();
    fireEvent.press(view.getByLabelText('Energía: Muy alta, 5 de 5'));
    await waitFor(() => expect(journal.getSnapshot().patch.energyPost).toEqual({ op: 'clear' }));
    expect(journal.value('fatiguePost')).toBe(1); expect(view.getByText('Al terminar')).toBeTruthy();
  });
  it('keeps a failed read distinct from a confirmed empty history', async () => {
    const view = render(<OwnlevelThemeProvider><RecordedTrainingFeelings read={async () => ({ status: 'unavailable' })} /></OwnlevelThemeProvider>);
    await waitFor(() => expect(view.getByText('La lectura no está confirmada.')).toBeTruthy());
    expect(view.queryByText('Sin respuestas registradas.')).toBeNull();
    view.unmount();
    const confirmed = render(<OwnlevelThemeProvider><RecordedTrainingFeelings values={{}} /></OwnlevelThemeProvider>);
    expect(confirmed.getByText('Sin respuestas registradas.')).toBeTruthy();
  });
});

// #449: one compact capture per moment, never asked again once confirmed, never copied between moments.
type Values = Record<string, unknown>;
const fact = (key: string, value: number) => ({ value, instrumentVersion: 'energy-fatigue/1', declaredMoment: key.endsWith('Pre') ? 'pre' : 'post',
  declaredAt: '2026-11-09T14:56:00.000Z', capturedAt: '2026-11-09T14:56:00.000Z', source: 'mobile', receivedAt: '2026-11-09T14:56:01.000Z', temporalQuality: 'unverified_client_clock' });
function serverWith(values: Values, revision = 0) {
  return { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-09T14:55:00Z', endedAt: null, revision, values };
}
function journalWith(initial: Values = {}) {
  const stored = new Map<string, string>();
  let server = serverWith(initial), keys = 0;
  const writes: unknown[] = [];
  let next: 'ok' | 'unavailable' = 'ok';
  const journal = new TrainingFeelingsJournal({ getItem: async k => stored.get(k) ?? null, setItem: async (k, v) => { stored.set(k, v); } }, {
    read: async () => ({ status: 'ok', data: server }),
    write: async input => {
      writes.push(input);
      if (next === 'unavailable') return { status: 'unavailable' };
      const values: Values = { ...server.values };
      for (const [key, change] of Object.entries((input as { patch: Record<string, { op: string; value?: number }> }).patch)) {
        if (change.op === 'clear') delete values[key]; else values[key] = fact(key, change.value!);
      }
      server = serverWith(values, server.revision + 1); return { status: 'ok', data: server };
    },
  }, 'owner', sid, 'mobile', () => `synthetic:${++keys}`);
  return { journal, writes, fail: () => { next = 'unavailable'; }, recover: () => { next = 'ok'; },
    elsewhere: (key: string, value: number) => { server = serverWith({ ...server.values, [key]: fact(key, value) }, server.revision + 1); } };
}
const controller = (journal: TrainingFeelingsJournal) => ({ getSnapshot: () => ({ intent: null }), retryIntent: async () => {}, finish: async () => {}, resolveFeelings: async () => {}, feelings: journal }) as unknown as ActiveSessionController;
const show = (journal: TrainingFeelingsJournal, phase: 'pre' | 'post') =>
  render(<GestureHandlerRootView><OwnlevelThemeProvider><TrainingFeelings phase={phase} journal={journal} controller={controller(journal)} /></OwnlevelThemeProvider></GestureHandlerRootView>);

describe('compact capture by moment (#449)', () => {
  it('starts folded, saves once on request, folds into an editable summary and is not asked again on reopen', async () => {
    const { journal, writes } = journalWith(); await journal.refresh();
    const view = show(journal, 'pre');
    expect(view.getByText('Al empezar')).toBeTruthy(); expect(view.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.press(view.getByLabelText('Responder sensaciones al empezar'));
    fireEvent.press(view.getByLabelText('Energía: Alta, 4 de 5'));
    await waitFor(() => expect(view.getByText('Sin guardar')).toBeTruthy());
    expect(writes).toHaveLength(0); // Choosing never writes: one explicit confirmation per operation.
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar sensaciones' })); });
    await waitFor(() => expect(view.getByText('Energía alta')).toBeTruthy());
    expect(writes).toHaveLength(1); expect(view.queryAllByRole('radio')).toHaveLength(0);
    expect(view.queryByText('Respuestas pendientes de confirmación')).toBeNull();
    view.unmount();
    const reopened = show(journal, 'pre');
    expect(reopened.getByText('Energía alta')).toBeTruthy(); expect(reopened.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.press(reopened.getByLabelText('Editar sensaciones al empezar'));
    expect(reopened.getByLabelText('Energía: Alta, 4 de 5').props.accessibilityState.selected).toBe(true);
    fireEvent.press(reopened.getByLabelText('Listo con las sensaciones al empezar'));
    expect(reopened.queryAllByRole('radio')).toHaveLength(0); expect(writes).toHaveLength(1);
  });
  it('keeps an unsent or uncertain answer open with its recovery, retrying the same operation', async () => {
    const { journal, writes, fail, recover } = journalWith(); await journal.refresh();
    await act(async () => { await journal.change('fatiguePre', 2); });
    const view = show(journal, 'pre');
    expect(view.getByLabelText('Fatiga: Poca, 2 de 5').props.accessibilityState.selected).toBe(true); // A draft never folds away.
    fail();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar sensaciones' })); });
    await waitFor(() => expect(view.getByText('Respuestas pendientes de confirmación')).toBeTruthy());
    expect(view.getByText(/Guardado sin confirmar/)).toBeTruthy(); expect(view.queryByLabelText('Listo con las sensaciones al empezar')).toBeNull();
    recover();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Comprobar operación pendiente' })); });
    await waitFor(() => expect(view.getByText('Fatiga poca')).toBeTruthy());
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
  });
  it('never shows the earlier answer as the finishing one, and attributes drafts and pending work to their own moment', async () => {
    const { journal, fail } = journalWith({ energyPre: fact('energyPre', 4) }); await journal.refresh();
    const finish = show(journal, 'post');
    expect(finish.getByText('Al terminar')).toBeTruthy();
    expect(finish.getAllByRole('radio').every(radio => radio.props.accessibilityState.selected === false)).toBe(true);
    expect(journal.value('energyPost')).toBeNull();
    await act(async () => { await journal.change('fatiguePre', 3); });
    expect(finish.queryByText('Respuestas pendientes de confirmación')).toBeNull();
    expect(finish.getByText('Tus respuestas de al empezar sin guardar también se guardan con el entrenamiento.')).toBeTruthy();
    fail(); await act(async () => { await journal.save(); });
    expect(finish.getByText('Hay respuestas de al empezar pendientes de confirmación')).toBeTruthy();
    expect(finish.getByRole('button', { name: 'Comprobar operación pendiente' })).toBeTruthy();
  });
});

// #462: the start capture uses the finish sheet's 1–5 control, folds with a local animation and keeps recovery outside the fold.
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const ticks = () => mockTrigger.mock.calls.filter(([event]) => event === 'stepperChange').length;
const toggle = (view: ReturnType<typeof show>) => view.getByTestId('feelings-pre-edit');
describe('start capture with the shared scale control (#462)', () => {
  beforeEach(() => { mockTrigger.mockReset(); jest.mocked(withTiming).mockClear(); });
  afterEach(() => { jest.restoreAllMocks(); });
  it('selects, clears and answers partially or fully on the shared control, announcing feeling, word, score and selection', async () => {
    const { journal, writes } = journalWith(); await journal.refresh();
    const view = show(journal, 'pre');
    fireEvent.press(toggle(view));
    expect(view.getByLabelText('Energía, al empezar, opcional').props.accessibilityRole).toBe('radiogroup');
    expect(view.getByTestId('summary-energyPre-4').props.accessibilityLabel).toBe('Energía: Alta, 4 de 5');
    await act(async () => { fireEvent.press(view.getByLabelText('Energía: Alta, 4 de 5')); await settle(); });
    const chosen = view.getByLabelText('Energía: Alta, 4 de 5');
    expect(chosen.props.accessibilityState).toMatchObject({ selected: true }); expect(chosen.props.accessibilityHint).toBe('Tocá de nuevo para quitar la respuesta');
    expect(view.getByText('Energía · Alta')).toBeTruthy(); expect(journal.value('fatiguePre')).toBeNull(); // Partial: fatigue stays unanswered.
    await act(async () => { fireEvent.press(view.getByLabelText('Fatiga: Mucha, 4 de 5')); await settle(); });
    expect([journal.value('energyPre'), journal.value('fatiguePre')]).toEqual([4, 4]); // Complete.
    await act(async () => { fireEvent.press(view.getByLabelText('Energía: Alta, 4 de 5')); await settle(); });
    expect(journal.getSnapshot().patch.energyPre).toEqual({ op: 'clear' }); expect(journal.value('energyPre')).toBeNull();
    expect(ticks()).toBe(3); expect(writes).toHaveLength(0); // Choosing never writes; one tick per accepted change.
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar sensaciones' })); await settle(); });
    expect(writes).toHaveLength(1); expect(ticks()).toBe(3); // Saving adds no tick of its own.
    expect(view.getByText('Fatiga mucha')).toBeTruthy();
  });
  it('ticks once when a drag settles on another number, never while dragging or when it lands where it started', async () => {
    const { journal } = journalWith({ energyPre: fact('energyPre', 2) }); await journal.refresh();
    const view = show(journal, 'pre'); fireEvent.press(toggle(view));
    // 5 slots of 60pt inside a 4pt inset: slot n is centered at 4 + 60·(n − 0.5).
    fireEvent(view.getByLabelText('Energía, al empezar, opcional'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 308, height: 52 } } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fireGestureHandler(getByGestureTestId('summary-energyPre-drag'), [{ state: State.BEGAN, x: 94 }, { state: State.ACTIVE, x: 150 }, { state: State.ACTIVE, x: 94 }, { state: State.END, x: 94 }]); await settle(); });
    expect(ticks()).toBe(0); expect(journal.getSnapshot().patch.energyPre).toBeUndefined(); // Landed on 2 again: no change, no write to the draft.
    await act(async () => { fireGestureHandler(getByGestureTestId('summary-energyPre-drag'), [{ state: State.BEGAN, x: 94 }, { state: State.ACTIVE, x: 150 }, { state: State.ACTIVE, x: 200 }, { state: State.ACTIVE, x: 274 }, { state: State.END, x: 274 }]); await settle(); });
    expect(ticks()).toBe(1); expect(journal.value('energyPre')).toBe(5);
  });
  it('opens and folds locally and repeatedly on the same button, without global layout animation; Reduce Motion fades', async () => {
    const layout = jest.spyOn(LayoutAnimation, 'configureNext');
    const { journal } = journalWith({ energyPre: fact('energyPre', 3) }); await journal.refresh();
    const view = show(journal, 'pre');
    const button = toggle(view);
    for (let round = 0; round < 4; round++) {
      fireEvent.press(toggle(view)); expect(toggle(view).props.accessibilityState).toMatchObject({ expanded: true });
      expect(view.getAllByRole('radio')).toHaveLength(10);
      fireEvent.press(toggle(view)); expect(toggle(view).props.accessibilityState).toMatchObject({ expanded: false });
      expect(view.queryAllByRole('radio')).toHaveLength(0); // Folded scales are hidden from VoiceOver and touch.
    }
    expect(toggle(view)).toBe(button); // Same element: VoiceOver keeps its focus while the panel opens and folds.
    expect(view.getAllByRole('radio', { includeHiddenElements: true })).toHaveLength(10); // Still mounted and measured: no first-frame guess.
    expect(layout).not.toHaveBeenCalled();
    expect(jest.mocked(withTiming).mock.calls.filter(([, config]) => (config as { duration?: number })?.duration === 300).length).toBeGreaterThanOrEqual(8);
    view.unmount(); jest.mocked(withTiming).mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const reduced = show(journal, 'pre'); await act(settle);
    fireEvent.press(toggle(reduced));
    expect(jest.mocked(withTiming).mock.calls.at(-1)?.[1]).toMatchObject({ duration: 200 }); // A short fade; the height does not travel.
  });
  it('respects Dynamic Type everywhere in the capture', async () => {
    const { journal } = journalWith({ energyPre: fact('energyPre', 3) }); await journal.refresh();
    const view = show(journal, 'pre'); fireEvent.press(toggle(view));
    expect(view.UNSAFE_getAllByType(Text).every(text => text.props.allowFontScaling !== false && text.props.adjustsFontSizeToFit !== true)).toBe(true);
  });
  it('keeps a failed read with nothing local folded, with its notice and reread outside the fold (return from background)', async () => {
    let fail = false;
    const stored = new Map<string, string>();
    const journal = new TrainingFeelingsJournal({ getItem: async k => stored.get(k) ?? null, setItem: async (k, v) => { stored.set(k, v); } }, {
      read: async () => fail ? { status: 'unavailable' } : { status: 'ok', data: serverWith({ energyPre: fact('energyPre', 4) }) }, write: async () => ({ status: 'unavailable' }),
    }, 'owner', sid, 'mobile', () => 'synthetic:read');
    await journal.refresh();
    const view = show(journal, 'pre');
    expect(view.getByText('Energía alta')).toBeTruthy();
    fail = true; await act(async () => { await journal.refresh(); }); // What returning to the app does when the read fails.
    expect(toggle(view).props.accessibilityState).toMatchObject({ expanded: false }); expect(view.queryAllByRole('radio')).toHaveLength(0);
    expect(view.getByText(/No pudimos leer las sensaciones/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Volver a leer sensaciones' })).toBeEnabled();
    fail = false; await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Volver a leer sensaciones' })); await settle(); });
    expect(view.queryByText(/No pudimos leer las sensaciones/)).toBeNull(); expect(view.queryByRole('button', { name: 'Volver a leer sensaciones' })).toBeNull();
  });
  it('keeps an unsent start answer open after the app returns, and a failed read never hides it', async () => {
    let unreadable = false;
    const stored = new Map<string, string>();
    const journal = new TrainingFeelingsJournal({ getItem: async k => stored.get(k) ?? null, setItem: async (k, v) => { stored.set(k, v); } }, {
      read: async () => unreadable ? { status: 'unavailable' } : { status: 'ok', data: serverWith({}) }, write: async () => ({ status: 'unavailable' }),
    }, 'owner', sid, 'mobile', () => 'synthetic:draft');
    await journal.refresh(); await journal.change('energyPre', 2);
    const view = show(journal, 'pre');
    expect(view.getByLabelText('Energía: Baja, 2 de 5').props.accessibilityState.selected).toBe(true);
    expect(view.queryByTestId('feelings-pre-edit')).toBeNull(); expect(view.getByText('Sin guardar')).toBeTruthy();
    view.unmount();
    const back = show(journal, 'pre'); // Remount, as after the app was closed and reopened with the session still open.
    expect(back.getByRole('button', { name: 'Guardar sensaciones' })).toBeTruthy(); expect(back.getByLabelText('Energía: Baja, 2 de 5').props.accessibilityState.selected).toBe(true);
    unreadable = true; await act(async () => { await journal.refresh(); });
    expect(back.getByLabelText('Energía: Baja, 2 de 5').props.accessibilityState.selected).toBe(true); // Still open, still the local answer.
    expect(back.getByText(/No pudimos leer las sensaciones/)).toBeTruthy(); expect(back.getByRole('button', { name: 'Volver a leer sensaciones' })).toBeTruthy();
  });
  it('keeps the uncertain write and the conflict actionable while folded, and never unfolds start scales for finishing work', async () => {
    const { journal, writes, fail, recover } = journalWith(); await journal.refresh();
    await journal.change('energyPost', 4); fail(); await journal.save(); // A finishing answer left pending (saved from the start screen's journal).
    const view = show(journal, 'pre');
    expect(toggle(view).props.accessibilityState).toMatchObject({ expanded: false }); expect(view.queryAllByRole('radio')).toHaveLength(0);
    expect(view.getByText('Hay respuestas de al terminar pendientes de confirmación')).toBeTruthy();
    expect(view.getByText(/Guardado sin confirmar/)).toBeTruthy();
    recover(); await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Comprobar operación pendiente' })); await settle(); });
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); // The same operation, exactly once more.
    view.unmount();
    const conflicted = journalWith({ energyPre: fact('energyPre', 1) }); await conflicted.journal.refresh();
    await conflicted.journal.change('energyPre', 5);
    conflicted.elsewhere('energyPre', 2); // Another device saved in between: the save stops for review, with both choices visible.
    const blocked = show(conflicted.journal, 'pre');
    await act(async () => { fireEvent.press(blocked.getByRole('button', { name: 'Guardar sensaciones' })); await settle(); });
    expect(blocked.getByText('Necesita revisión')).toBeTruthy(); expect(blocked.getByText(/Guardado: Energía al empezar: 2/)).toBeTruthy();
    expect(blocked.getByRole('button', { name: 'Conservar lo guardado' })).toBeTruthy(); expect(blocked.getByRole('button', { name: 'Revisar mis respuestas para reenviar' })).toBeTruthy();
    expect(conflicted.writes).toHaveLength(0);
  });
  it('does not flash a checking line under the scales for a plain answer', async () => {
    const stored = new Map<string, string>(); let gate: (() => void) | null = null, hold = false;
    const journal = new TrainingFeelingsJournal({ getItem: async k => stored.get(k) ?? null,
      setItem: async (k, v) => { if (hold) await new Promise<void>(done => { gate = done; }); stored.set(k, v); } },
    { read: async () => ({ status: 'ok', data: serverWith({}) }), write: async () => ({ status: 'unavailable' }) }, 'owner', sid, 'mobile', () => 'synthetic:busy');
    await journal.refresh();
    const view = show(journal, 'pre'); fireEvent.press(toggle(view));
    hold = true;
    await act(async () => { fireEvent.press(view.getByLabelText('Fatiga: Poca, 2 de 5')); await settle(); });
    expect(journal.getSnapshot().busy).toBe(true); // Writing the local draft, mid-answer.
    expect(view.queryByText('Comprobando sensaciones…')).toBeNull();
    hold = false; await act(async () => { (gate as (() => void) | null)?.(); await settle(); });
    expect(journal.value('fatiguePre')).toBe(2);
  });
});

