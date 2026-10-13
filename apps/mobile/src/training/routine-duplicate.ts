import { duplicateMobileTrainingRoutine } from '@/api';
import type { MobileApiClient } from '@/api/client';
import type { RoutineDetail } from '@/api/routine-editor';
import type { DuplicateRoutineSource, RoutineCreateInput } from './create-routine-sheet';
export function routineDuplicateSource(detail: RoutineDetail): DuplicateRoutineSource {
  const { routine, items } = detail;
  return { id: routine.id, name: routine.name, color: routine.color, exerciseCount: items.length,
    setCount: items.reduce((total, item) => total + item.targets.sets.length, 0), expectedUpdatedAt: routine.updatedAt,
    expectedTemplateVersion: routine.templateVersion, ...(routine.unrecognizedColor ? { unrecognizedColor: routine.unrecognizedColor } : {}) };
}
export function duplicateRoutine(client: MobileApiClient, source: DuplicateRoutineSource, input: RoutineCreateInput) {
  return duplicateMobileTrainingRoutine(client, source.id, { ...input, expectedUpdatedAt: source.expectedUpdatedAt, expectedTemplateVersion: source.expectedTemplateVersion });
}
