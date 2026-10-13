import type { SessionExerciseDraft } from './active-session-model';

export type NextSessionDecision = SessionExerciseDraft['decision'];
export type SessionNextOptionsProps = {
  open: boolean;
  editable: boolean;
  name: string;
  decision: NextSessionDecision;
  decisionNote: string;
  applyToRoutine: boolean;
  routineLinked: boolean;
  addToRoutineName?: string | null;
  onClose: () => void;
  onDecision: (decision: NextSessionDecision) => void;
  onApply: (value: boolean) => void;
};
