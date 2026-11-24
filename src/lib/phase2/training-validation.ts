import type {
  EditableRoutineSet,
  EditableWorkoutSet,
  CompletedSessionCorrectionInput,
  RoutineExercisePayload,
  SessionMetadataInput,
  TrainingAdjustment,
  WorkoutExercisePayload,
} from "./types";
import { parseLocalizedDecimal } from "../localized-decimal";

const ADJUSTMENTS = new Set<TrainingAdjustment>([
  "maintain",
  "increase_weight",
  "increase_reps",
  "custom",
]);

function assertFiniteInRange(
  value: number | null,
  label: string,
  min: number,
  max: number,
  maxFractionDigits?: number,
) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} debe estar entre ${min} y ${max}.`);
  }
  if (maxFractionDigits !== undefined) {
    const scaled = value * 10 ** maxFractionDigits;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-8) {
      throw new Error(`${label} admite hasta ${maxFractionDigits} decimales.`);
    }
  }
}

function assertIntegerInRange(
  value: number | null,
  label: string,
  min: number,
  max: number,
) {
  assertFiniteInRange(value, label, min, max);
  if (value !== null && !Number.isInteger(value)) {
    throw new Error(`${label} debe ser un número entero.`);
  }
}

export function assertAdjustment(
  value: string,
  label = "Ajuste",
): asserts value is TrainingAdjustment {
  if (!ADJUSTMENTS.has(value as TrainingAdjustment)) {
    throw new Error(`${label} inválido.`);
  }
}

export function assertConsecutiveSets(
  sets: ReadonlyArray<{ set_number: number }>,
) {
  if (sets.length < 1 || sets.length > 50) {
    throw new Error("La cantidad de series debe estar entre 1 y 50.");
  }

  sets.forEach((set, index) => {
    if (set.set_number !== index + 1) {
      throw new Error("Las series deben estar numeradas en orden desde 1.");
    }
  });
}

export function validateRoutineSets(sets: EditableRoutineSet[]) {
  assertConsecutiveSets(sets);
  sets.forEach((set, index) => {
    const number = index + 1;
    assertIntegerInRange(set.target_reps, `Repeticiones de serie ${number}`, 0, 1000);
    assertFiniteInRange(set.target_weight_kg, `Peso de serie ${number}`, 0, 9999.99, 2);
    assertIntegerInRange(set.target_rir, `RIR de serie ${number}`, 0, 10);
  });
}

export function validateWorkoutSets(sets: EditableWorkoutSet[]) {
  assertConsecutiveSets(sets);
  sets.forEach((set, index) => {
    const number = index + 1;
    assertIntegerInRange(set.target_reps, `Objetivo de serie ${number}`, 0, 1000);
    assertFiniteInRange(set.target_weight_kg, `Peso objetivo de serie ${number}`, 0, 9999.99, 2);
    assertIntegerInRange(set.target_rir, `RIR objetivo de serie ${number}`, 0, 10);
    assertIntegerInRange(set.actual_reps, `Repeticiones de serie ${number}`, 0, 1000);
    assertFiniteInRange(set.actual_weight_kg, `Peso real de serie ${number}`, 0, 9999.99, 2);

    if (set.is_completed && set.actual_reps === null) {
      throw new Error(`Completá las repeticiones de la serie ${number}.`);
    }
    // #537: absent keeps the stored kind (installed apps never send it).
    if (set.set_kind !== undefined && set.set_kind !== "work" && set.set_kind !== "warmup") {
      throw new Error(`El tipo de la serie ${number} no es válido.`);
    }
  });
}

export function validateRoutineExercisePayload(payload: RoutineExercisePayload) {
  assertAdjustment(payload.next_adjustment);
  assertIntegerInRange(payload.rest_min_seconds, "Descanso mínimo", 0, 3600);
  assertIntegerInRange(payload.rest_max_seconds, "Descanso máximo", 0, 3600);
  if (
    payload.rest_min_seconds !== null &&
    payload.rest_max_seconds !== null &&
    payload.rest_min_seconds > payload.rest_max_seconds
  ) {
    throw new Error("El descanso mínimo no puede superar al máximo.");
  }
  validateRoutineSets(payload.sets);
}

export function validateWorkoutExercisePayload(payload: WorkoutExercisePayload) {
  assertAdjustment(payload.decision, "Decisión");
  if (payload.decision === "custom" && !payload.decision_note.trim()) {
    throw new Error("Escribí el recordatorio personalizado para la próxima vez.");
  }
  validateWorkoutSets(payload.sets);

  const hasCompletedSet = payload.sets.some((set) => set.is_completed);
  if (payload.is_completed !== hasCompletedSet) {
    throw new Error("El estado del ejercicio no coincide con sus series realizadas.");
  }
}

export function validateSessionMetadata(metadata: SessionMetadataInput) {
  assertIntegerInRange(metadata.energy_level, "Energía", 1, 5);
  assertIntegerInRange(metadata.performance_level, "Rendimiento", 1, 5);
  assertIntegerInRange(metadata.pain_level, "Dolor", 0, 10);
  assertFiniteInRange(metadata.treadmill_minutes, "Minutos de cinta", 0, 1440, 2);
  assertFiniteInRange(metadata.treadmill_distance_km, "Distancia de cinta", 0, 1000, 2);
  assertFiniteInRange(metadata.treadmill_speed_kmh, "Velocidad de cinta", 0, 100, 2);
  assertFiniteInRange(
    metadata.treadmill_incline_percent,
    "Inclinación de cinta",
    0,
    100,
    2,
  );
}

export function validateCompletedSessionCorrection(input: CompletedSessionCorrectionInput) {
  if (!input.sessionId.trim() || !input.expectedSessionUpdatedAt.trim()) {
    throw new Error("La sesión a corregir no es válida.");
  }
  validateSessionMetadata({
    session_name: "",
    ...input.metadata,
  });
  for (const exercise of input.exercises) {
    if (!exercise.id.trim() || !exercise.expectedUpdatedAt.trim()) {
      throw new Error("Uno de los ejercicios a corregir no es válido.");
    }
    for (const set of exercise.sets) {
      if (!set.id.trim()) throw new Error("Una de las series a corregir no es válida.");
      assertIntegerInRange(set.actual_reps, "Repeticiones realizadas", 0, 1000);
      assertFiniteInRange(set.actual_weight_kg, "Peso realizado", 0, 9999.99, 2);
    }
  }
}

export function nullableNumberFromInput(value: string): number | null {
  return parseLocalizedDecimal(value);
}

export function payloadsEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
