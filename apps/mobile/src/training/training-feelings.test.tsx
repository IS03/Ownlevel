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
    fireEvent.press(view.getByLabelText('Quitar energía'));
    await waitFor(() => expect(journal.getSnapshot().patch.energyPost).toEqual({ op: 'clear' }));
    expect(journal.value('fatiguePost')).toBe(1); expect(view.getByText('Cómo terminaste')).toBeTruthy();
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
