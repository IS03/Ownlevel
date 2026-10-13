import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { Pressable, Text, View } from 'react-native';
import { useExerciseLibrary } from './use-exercise-library';
const mockStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockClient = { request: jest.fn() };
jest.mock('@/api', () => ({
  useApiResource: jest.requireActual<typeof import('@/api/resource')>('@/api/resource').useApiResource,
  useMobileApi: () => ({ client: mockClient }), fetchMobileTrainingExercises: (...args: unknown[]) => mockFetch(...args),
  createMobileTrainingExercise: jest.fn(), updateMobileTrainingExerciseIdentity: jest.fn(), setMobileTrainingExerciseStatus: (...args: unknown[]) => mockStatus(...args),
}));
it('retains the complete confirmed catalog when a later successful envelope contains an unavailable catalog', async () => {
  const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' };
  mockFetch.mockResolvedValueOnce({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [{ id: 'exercise', name: 'Press' }], routines: [] } } }, meta })
    .mockResolvedValue({ status: 'ok', data: { catalog: { status: 'unavailable' } }, meta });
  function Harness() {
    const library = useExerciseLibrary();
    return <View><Text>{library.exercises.map(exercise => exercise.name).join(',')}</Text><Text>{library.stale ? 'stale' : 'fresh'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar" onPress={() => void library.refresh()} /></View>;
  }
  const view = render(<Harness />); await waitFor(() => expect(view.getByText('fresh')).toBeTruthy());
  await act(async () => fireEvent.press(view.getByRole('button', { name: 'Actualizar' })));
  expect(view.getByText('stale')).toBeTruthy(); expect(view.getByText('Press')).toBeTruthy(); view.unmount();
});

it('never pairs old identity fields with a new version from a partial status reply', async () => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValueOnce({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [{ id: 'exercise', name: 'Old identity', updatedAt: 'old-version', isActive: true }], routines: [] } } } })
    .mockResolvedValue({ status: 'unavailable', reason: 'network' });
  mockStatus.mockResolvedValue({ status: 'ok', data: { exercise: { id: 'exercise', isActive: false, updatedAt: 'new-version' } } });
  function Harness() {
    const library = useExerciseLibrary(), exercise = library.exercises[0];
    return <View><Text>{exercise ? `${exercise.name}:${exercise.updatedAt}:${exercise.isActive}` : 'loading'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Archivar" onPress={() => void library.status(exercise!)} /></View>;
  }
  const view = render(<Harness />); await waitFor(() => expect(view.getByText('Old identity:old-version:true')).toBeTruthy());
  await act(async () => fireEvent.press(view.getByRole('button', { name: 'Archivar' })));
  expect(view.getByText('Old identity:old-version:false')).toBeTruthy(); expect(view.queryByText(/new-version/)).toBeNull(); view.unmount();
});
