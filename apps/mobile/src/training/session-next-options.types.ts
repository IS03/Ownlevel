import type { SessionExerciseDraft } from './active-session-model';

export type NextSessionDecision = SessionExerciseDraft['decision'];
export type SessionNextOptionsProps = {
  open: boolean;
  /** A new native presentation request for every valid tap, including during dismissal. */
  openRequest?: number;
  onOpen?: () => void;
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
