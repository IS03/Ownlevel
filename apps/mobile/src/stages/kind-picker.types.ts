import type { StageKind } from '@/api/nutrition-stages';

export type KindPickerProps = {
  value: StageKind | null;
  suggested: StageKind | null;
  disabled?: boolean;
  onChange: (kind: StageKind) => void;
  /** Shown while no type is chosen (iOS menu). Default: "Elegí un tipo". */
  placeholder?: string;
};
