import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  "src/app/(app)/train/session/[id]/session-editor.tsx",
  "utf8",
);
const addExerciseSheet = readFileSync(
  "src/app/(app)/train/session/[id]/add-exercise-sheet.tsx",
  "utf8",
);
const quickHistorySheet = readFileSync(
  "src/app/(app)/train/session/[id]/quick-exercise-history-sheet.tsx",
  "utf8",
);

describe("PR 14 — interacción de sesión", () => {
  it("ancla la card con layout effect y compensación, sin scrollIntoView", () => {
    expect(editor).toContain("useLayoutEffect");
    expect(editor).toContain("pendingScrollAnchorRef");
    expect(editor).toContain("calculateScrollCompensation");
    expect(editor).toContain("window.scrollBy(0, delta)");
    expect(editor).not.toContain("scrollIntoView");
  });

  it("mantiene un solo ejercicio abierto y guarda el anterior al cambiar", () => {
    expect(editor).toContain(
      "setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId))",
    );
    expect(editor).toContain("autosaveRef.current?.flush(previouslyExpanded)");
    expect(editor).toContain('aria-expanded={expanded}');
    expect(editor).toContain('aria-controls={exerciseContentId}');
  });

  it("mantiene una nota breve y editable dentro del workspace del ejercicio", () => {
    expect(editor).toContain("const quickNote = payload.notes.trim()");
    expect(editor).toContain("line-clamp-1");
    expect(editor).toContain("Nota para próximas sesiones");
    expect(editor).toContain("Nota del ejercicio en esta sesión");
  });

  it("usa un slot fijo para estados normales y reserva la recuperación para errores", () => {
    expect(editor).toContain("compactAutosaveStatus");
    expect(editor).toContain('"flex size-5 shrink-0 items-center justify-center"');
    expect(editor).not.toContain("Guardando…");
    expect(editor).not.toContain("Cambios locales");
    expect(editor).toContain("!readOnly && status?.error");
    expect(editor).toContain("Usar versión guardada");
    expect(editor).toContain("Reintentar");
    expect(editor).toContain("Actualizar");
  });

  it("reserva un rail derecho para progreso y controles antes de truncar el contenido", () => {
    expect(editor).toContain("grid-cols-[2.75rem_minmax(0,1fr)_auto]");
    expect(editor).toContain('className="flex shrink-0 items-center gap-2"');
    expect(editor).toContain("exerciseProgressLabel(payload)");
    expect(editor).toContain("min-w-[3.75rem]");
    expect(editor).toContain("tabular-nums");
    expect(editor).toContain("const collapsedSubtitle = exerciseMeta;");
    expect(editor).not.toContain("completedExerciseSummary(payload)");
  });

  it("mantiene la recomendación real al abrir el ejercicio", () => {
    expect(editor).toContain("{receivedReminder ? (");
    expect(editor).not.toContain("!expanded && receivedReminder");
  });

  it("mantiene la actualización de targets compacta y limitada a series completas", () => {
    expect(editor).toContain("Tomar resultado de hoy");
    expect(editor).toContain("Usa las series completadas como base.");
    expect(editor).toContain('role="switch"');
    expect(editor).toContain('aria-checked={payload.apply_to_routine}');
    expect(editor).not.toContain(': "Sin cambios"');
  });

  it("deja la nota en lectura compacta hasta que se solicita editar", () => {
    expect(editor).toContain("editingNoteExerciseId");
    expect(editor).toContain('{noteEditorOpen ? "Listo" : quickNote ? "Editar" : "Agregar"}');
    expect(editor).not.toContain('quickNote || "Sin nota"');
    expect(editor).toContain("noteEditorOpen ? (");
    expect(editor).toContain('className="min-h-20 w-full rounded-lg border bg-background');
  });

  it("muestra próxima vez en el flujo principal sin otra card o accordion", () => {
    expect(editor).toContain('<Label>Próxima vez</Label>');
    expect(editor).not.toContain("Progresión y próxima vez");
    expect(editor).toContain('aria-label="Decisión para la próxima vez"');
    expect(editor).not.toContain("Dejá todo sin marcar para mantener el objetivo actual.");
  });

  it("mantiene cancelar detrás del disclosure destructivo", () => {
    expect(editor).toContain("Más opciones");
    expect(editor).toContain("bg-destructive/80");
    expect(editor).toContain('variant="destructive"');
    expect(editor).toContain("Cancelar entrenamiento");
  });

  it("abre últimas veces como una consulta local sin convertirla en otro ejercicio abierto", () => {
    expect(editor).toContain("<QuickExerciseHistorySheet");
    expect(editor).toContain("setQuickHistoryExerciseId(exercise.id)");
    expect(editor).toContain("Últimas veces");
    expect(editor).not.toContain("toggleExercise(exercise.id);\n                        setQuickHistoryExerciseId");
  });

  it("presenta snapshots compactos, sets realizados y un vacío honesto dentro de un sheet", () => {
    expect(quickHistorySheet).toContain("Dialog.Root");
    expect(quickHistorySheet).toContain("quickHistoryCompletedSets(session)");
    expect(quickHistorySheet).toContain("splitQuickExerciseHistory");
    expect(quickHistorySheet).toContain("Ver más historial");
    expect(quickHistorySheet).toContain("/train/session/${session.sessionId}");
    expect(quickHistorySheet).toContain("set.target_rir");
    expect(quickHistorySheet).toContain("Todavía no hay sesiones finalizadas con este ejercicio.");
    expect(quickHistorySheet).not.toContain("0 kg");
  });

  it("mantiene el descanso como estado local persistible y no lo mezcla con autosave", () => {
    expect(editor).toContain("REST_TIMER_STORAGE_KEY_PREFIX");
    expect(editor).toContain("restTimerStorageKey(detail.session.id)");
    expect(editor).toContain("autosaveRef.current?.change");
  });

  it("usa controles táctiles discretos para el resumen sin editar identidad histórica", () => {
    expect(editor).toContain("function RatingPicker");
    expect(editor).toContain("function PainSlider");
    expect(editor).toContain('<TrainingFeelings journal={feelings} phase="post"');
    expect(editor).toContain('Energía registrada (histórica)');
    expect(editor).toContain('label="Rendimiento"');
    expect(editor).toContain('htmlFor="session-notes">Notas</Label>');
    expect(editor).not.toContain("Notas (opcional)");
    expect(editor).toContain('type="range"');
    expect(editor).toContain('aria-label="Dolor, de 0 a 10"');
    expect(editor).not.toContain('htmlFor="session-name"');
    expect(editor).not.toContain('htmlFor="pain-note"');
  });

  it("mantiene el encabezado de sesión y alinea las series en dos tracks compartidos", () => {
    expect(editor).not.toContain('"sticky top-[max(0.5rem,env(safe-area-inset-top))]');
    expect(editor).toContain('overflow-hidden rounded-lg border border-border/55 bg-background/20');
    expect(editor).toContain('grid-rows-[2.25rem_auto] items-center gap-y-0 border-b');
    expect(editor).toContain('pb-1 pt-2 last:border-b-0');
    expect(editor).not.toContain('items-center rounded-lg border border-border/55 px-2 py-2');
    expect(editor).toContain("grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem_2.75rem]");
    expect(editor).toContain('col-start-2 row-start-2 truncate text-center');
    expect(editor).toContain('col-start-3 row-start-2 truncate text-center');
    expect(editor).toContain('h-8 w-full rounded-md border border-dashed');
    expect(editor).not.toContain("Este resumen se guarda al finalizar.");
  });

  it("mantiene KG y repeticiones editables, RIR de lectura y el check funcional", () => {
    expect(editor).toContain("<LocalizedDecimalInput");
    expect(editor).toContain('aria-label={`Repeticiones de la serie');
    expect(editor).toContain('aria-label={`RIR objetivo de la serie');
    expect(editor).not.toMatch(/<Input[\s\S]{0,160}aria-label=\{`RIR objetivo/);
    expect(editor).toContain('aria-pressed={set.is_completed}');
    expect(editor).toContain('is_completed: !current.is_completed');
  });
});

describe("PR25 — selector estable de ejercicios", () => {
  it("usa una altura mobile estable y reserva el scroll al área de resultados", () => {
    expect(addExerciseSheet).toContain("h-[min(82svh,44rem)]");
    expect(addExerciseSheet).toContain("lg:h-[min(78dvh,44rem)]");
    expect(addExerciseSheet).not.toContain("visualViewport");
    expect(addExerciseSheet).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(addExerciseSheet).toContain("shrink-0 border-t");
    expect(addExerciseSheet).not.toContain("max-h-[42dvh]");
  });

  it("no reemplaza la selección al cambiar búsqueda o filtro", () => {
    expect(addExerciseSheet).toContain("selectedExerciseId === exercise.id");
    expect(addExerciseSheet).toContain("Seleccionado:");
    expect(editor).not.toContain("filteredLibraryExercises[0]");
    expect(editor).not.toContain("setSelectedExerciseId(\"\")");
  });

  it("separa selección suave de CTA primaria y expone estado accesible", () => {
    expect(addExerciseSheet).toContain('aria-pressed={selected}');
    expect(addExerciseSheet).toContain("bg-primary/[0.07]");
    expect(addExerciseSheet).toContain("Agregar a la sesión");
    expect(addExerciseSheet).toContain("disabled={!selectedExercise || pending}");
  });

  it("mantiene la geometría y la salida secundaria al crear", () => {
    expect(addExerciseSheet).toContain("No hay ejercicios disponibles");
    expect(addExerciseSheet).toContain("Crear ejercicio nuevo");
    expect(addExerciseSheet).toContain("SessionCreateExerciseForm");
  });
});
