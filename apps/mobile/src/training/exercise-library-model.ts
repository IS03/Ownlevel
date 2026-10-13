import type {
  MobileTrainingExercise,
  MobileTrainingExerciseMutation,
  MobileTrainingMuscleGroup,
} from '@/api/exercises';

export const MUSCLE_GROUP_OPTIONS: readonly {
  value: MobileTrainingMuscleGroup;
  label: string;
}[] = [
  { value: 'pecho', label: 'Pecho' },
  { value: 'espalda', label: 'Espalda' },
  { value: 'piernas', label: 'Piernas' },
  { value: 'hombros', label: 'Hombros' },
  { value: 'bíceps', label: 'Bíceps' },
  { value: 'tríceps', label: 'Tríceps' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'cardio', label: 'Cardio' },
];

export const EXERCISE_IMPLEMENT_OPTIONS = [
  'Máquina',
  'Mancuernas',
  'Polea',
  'Polea con barra',
  'Barra',
  'Peso corporal',
  'Smith',
  'Banda',
  'Otro',
] as const;

export const EXERCISE_WEIGHT_MODE_OPTIONS = [
  'Peso total',
  'Por mancuerna',
  'Por brazo',
  'Total con barra',
  'Peso corporal',
  'Lingotes (no kg)',
  'Tiempo (segundos)',
] as const;

export type ExerciseLibraryGroup = MobileTrainingMuscleGroup | 'none';
export type ExerciseLibraryStatus = 'active' | 'archived' | 'all';
export type ExerciseRoutineUsage = 'any' | 'assigned' | 'unassigned';

export type ExerciseLibraryFilters = {
  usage: ExerciseRoutineUsage;
  routineIds: string[];
  muscleGroups: ExerciseLibraryGroup[];
  implements: string[];
  status: ExerciseLibraryStatus;
};

export const DEFAULT_EXERCISE_LIBRARY_FILTERS: ExerciseLibraryFilters = {
  usage: 'any',
  routineIds: [],
  muscleGroups: [],
  implements: [],
  status: 'active',
};

export type ExerciseFormValues = {
  name: string;
  muscleGroup: MobileTrainingMuscleGroup | null;
  muscleGroupLabel: string;
  implement: string;
  weightMode: string;
  suggestedSets: string;
  suggestedReps: string;
  suggestedWeight: string;
  suggestedRir: string;
  suggestedRestMin: string;
  suggestedRestMax: string;
  notes: string;
};

export function normalizeExerciseSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function muscleGroupLabel(group: MobileTrainingMuscleGroup | null): string {
  return MUSCLE_GROUP_OPTIONS.find((option) => option.value === group)?.label ?? 'Sin grupo';
}

export function exerciseSummary(exercise: MobileTrainingExercise): string | null {
  const parts = [exercise.implement?.trim(), exercise.weightMode?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function exerciseSearchText(exercise: MobileTrainingExercise): string {
  return normalizeExerciseSearch([
    exercise.name,
    exercise.muscleGroup,
    exercise.muscleGroupLabel,
    exercise.implement,
    exercise.weightMode,
  ].filter((value): value is string => Boolean(value)).join(' '));
}

export function sortExercises(exercises: readonly MobileTrainingExercise[]) {
  return [...exercises].sort((left, right) => left.name.localeCompare(right.name, 'es-AR'));
}

export function filterExercises(
  exercises: readonly MobileTrainingExercise[],
  query: string,
  filters: ExerciseLibraryFilters,
): MobileTrainingExercise[] {
  const normalizedQuery = normalizeExerciseSearch(query);
  const selectedImplements = new Set(filters.implements.map(normalizeExerciseSearch));
  return exercises.filter((exercise) => {
    const statusMatches = filters.status === 'all' ||
      (filters.status === 'active' ? exercise.isActive : !exercise.isActive);
    const routineMatches = filters.usage === 'unassigned'
      ? exercise.routineIds.length === 0
      : filters.usage === 'assigned'
        ? exercise.routineIds.length > 0 && (
          filters.routineIds.length === 0 ||
          exercise.routineIds.some((id) => filters.routineIds.includes(id))
        )
        : true;
    const muscleMatches = filters.muscleGroups.length === 0 ||
      filters.muscleGroups.includes(exercise.muscleGroup ?? 'none');
    const implementMatches = selectedImplements.size === 0 ||
      selectedImplements.has(normalizeExerciseSearch(exercise.implement ?? ''));
    return statusMatches && routineMatches && muscleMatches && implementMatches &&
      exerciseSearchText(exercise).includes(normalizedQuery);
  });
}

export function groupExercises(exercises: readonly MobileTrainingExercise[]) {
  const groups = new Map<ExerciseLibraryGroup, MobileTrainingExercise[]>();
  for (const exercise of exercises) {
    const key = exercise.muscleGroup ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), exercise]);
  }
  const order: readonly { value: ExerciseLibraryGroup; label: string }[] = [
    ...MUSCLE_GROUP_OPTIONS,
    { value: 'none', label: 'Sin clasificar' },
  ];
  return order.flatMap((group) => {
    const items = groups.get(group.value);
    return items?.length ? [{ ...group, exercises: sortExercises(items) }] : [];
  });
}

export function implementOptions(exercises: readonly MobileTrainingExercise[]): string[] {
  const values = new Map<string, string>();
  for (const exercise of exercises) {
    const label = exercise.implement?.trim();
    if (label) values.set(normalizeExerciseSearch(label), label);
  }
  return [...values.values()].sort((left, right) => left.localeCompare(right, 'es-AR'));
}

export function cloneFilters(filters: ExerciseLibraryFilters): ExerciseLibraryFilters {
  return {
    ...filters,
    routineIds: [...filters.routineIds],
    muscleGroups: [...filters.muscleGroups],
    implements: [...filters.implements],
  };
}

export function activeFilterCount(filters: ExerciseLibraryFilters): number {
  return Number(filters.usage !== 'any') + filters.routineIds.length +
    filters.muscleGroups.length + filters.implements.length +
    Number(filters.status !== 'active');
}

export function emptyExerciseForm(): ExerciseFormValues {
  return {
    name: '',
    muscleGroup: null,
    muscleGroupLabel: '',
    implement: '',
    weightMode: '',
    suggestedSets: '',
    suggestedReps: '',
    suggestedWeight: '',
    suggestedRir: '',
    suggestedRestMin: '',
    suggestedRestMax: '',
    notes: '',
  };
}

export function formatRest(seconds: number | null): string {
  if (seconds === null) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function exerciseFormFromDto(exercise: MobileTrainingExercise): ExerciseFormValues {
  return {
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    muscleGroupLabel: exercise.muscleGroupLabel ?? '',
    implement: exercise.implement ?? '',
    weightMode: exercise.weightMode ?? '',
    suggestedSets: exercise.suggestedSets === null ? '' : String(exercise.suggestedSets),
    suggestedReps: exercise.suggestedReps === null ? '' : String(exercise.suggestedReps),
    suggestedWeight: exercise.suggestedWeight === null ? '' : String(exercise.suggestedWeight),
    suggestedRir: exercise.suggestedRir === null ? '' : String(exercise.suggestedRir),
    suggestedRestMin: formatRest(exercise.suggestedRestMinSeconds),
    suggestedRestMax: formatRest(exercise.suggestedRestMaxSeconds),
    notes: exercise.notes ?? '',
  };
}

function optionalText(value: string, label: string, maximum = 120): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) throw new Error(`${label} no puede superar ${maximum} caracteres.`);
  return normalized;
}

function optionalNumber(value: string, label: string, maximum: number): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${label} debe estar entre 0 y ${maximum}.`);
  }
  return parsed;
}

function optionalInteger(value: string, label: string, maximum: number): number | null {
  const parsed = optionalNumber(value, label, maximum);
  if (parsed !== null && !Number.isInteger(parsed)) {
    throw new Error(`${label} debe ser un número entero.`);
  }
  return parsed;
}

export function parseRest(value: string, label: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const minutes = Number(normalized);
    if (minutes <= 60) return minutes * 60;
  }
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(normalized);
  if (!match) throw new Error(`${label} debe tener formato mm:ss.`);
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  if (seconds > 59 || total > 3600) {
    throw new Error(`${label} debe estar entre 0:00 y 60:00.`);
  }
  return total;
}

export function exerciseMutationFromForm(values: ExerciseFormValues): MobileTrainingExerciseMutation {
  const name = values.name.trim();
  if (!name) throw new Error('Nombre es obligatorio.');
  const suggestedRestMinSeconds = parseRest(values.suggestedRestMin, 'Descanso mínimo');
  const suggestedRestMaxSeconds = parseRest(values.suggestedRestMax, 'Descanso máximo');
  if ((suggestedRestMinSeconds === null) !== (suggestedRestMaxSeconds === null)) {
    throw new Error('Completá ambos descansos o dejá ambos vacíos.');
  }
  if (
    suggestedRestMinSeconds !== null && suggestedRestMaxSeconds !== null &&
    suggestedRestMinSeconds > suggestedRestMaxSeconds
  ) {
    throw new Error('El descanso mínimo no puede superar al máximo.');
  }
  return {
    name,
    muscleGroup: values.muscleGroup,
    muscleGroupLabel: optionalText(values.muscleGroupLabel, 'Músculo específico'),
    implement: optionalText(values.implement, 'Implemento'),
    weightMode: optionalText(values.weightMode, 'Registro de carga'),
    suggestedSets: optionalInteger(values.suggestedSets, 'Series', 100),
    suggestedReps: optionalInteger(values.suggestedReps, 'Reps', 1000),
    suggestedWeight: optionalNumber(values.suggestedWeight, 'Peso', 9999.99),
    suggestedRir: optionalInteger(values.suggestedRir, 'RIR', 10),
    suggestedRestMinSeconds,
    suggestedRestMaxSeconds,
    notes: optionalText(values.notes, 'Notas', 1000),
  };
}

export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

/** Mobile edits identity only. Legacy form callbacks retain defaults; the identity API projects only identity fields. */
export function exerciseIdentityMutation(values: ExerciseFormValues, original?: MobileTrainingExercise): MobileTrainingExerciseMutation {
  const identity = exerciseMutationFromForm({ ...values, suggestedSets: '', suggestedReps: '', suggestedWeight: '', suggestedRir: '', suggestedRestMin: '', suggestedRestMax: '' });
  return { ...identity, suggestedSets: original?.suggestedSets ?? null, suggestedReps: original?.suggestedReps ?? null,
    suggestedWeight: original?.suggestedWeight ?? null, suggestedRir: original?.suggestedRir ?? null,
    suggestedRestMinSeconds: original?.suggestedRestMinSeconds ?? null, suggestedRestMaxSeconds: original?.suggestedRestMaxSeconds ?? null };
}
export function weightModeHint(mode: string): string | null {
  return ({ 'Peso total': 'Anotás el peso que marca la máquina o el total que movés.', 'Por mancuerna': 'Anotás el peso de una sola mancuerna.',
    'Por brazo': 'Anotás el peso de un solo lado.', 'Total con barra': 'Anotás el peso de la barra más los discos.',
    'Peso corporal': 'Sin peso agregado.', 'Lingotes (no kg)': 'Anotás la cantidad de placas, no kilos.', 'Tiempo (segundos)': 'Anotás segundos en lugar de peso.' } as Record<string, string>)[mode] ?? null;
}
