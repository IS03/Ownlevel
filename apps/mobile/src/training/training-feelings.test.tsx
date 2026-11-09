import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { TrainingFeelingsJournal } from '@/api/training-feelings';
import { TrainingFeelings } from './training-feelings';
import type { ActiveSessionController } from './active-session-controller';
import { RecordedTrainingFeelings } from './recorded-training-feelings';
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
  return { journal, writes, fail: () => { next = 'unavailable'; }, recover: () => { next = 'ok'; } };
}
const controller = (journal: TrainingFeelingsJournal) => ({ getSnapshot: () => ({ intent: null }), retryIntent: async () => {}, finish: async () => {}, resolveFeelings: async () => {}, feelings: journal }) as unknown as ActiveSessionController;
const show = (journal: TrainingFeelingsJournal, phase: 'pre' | 'post') =>
  render(<OwnlevelThemeProvider><TrainingFeelings phase={phase} journal={journal} controller={controller(journal)} /></OwnlevelThemeProvider>);

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
