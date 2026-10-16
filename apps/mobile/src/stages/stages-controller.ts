import type {
  MobileApiReadResult,
  MobileApiRequestResult,
} from "@/api/results";
import {
  parseStagesIntent,
  type NutritionStages,
  type NutritionStage,
  type StagesIntent,
  type StagesResult,
  type StageKind,
} from "@/api/nutrition-stages";
import {
  stageDraft,
  sequenceDraft,
  chooseKind,
  stageFields,
  validSequence,
  scheduledCollision,
  type StageDraft,
  type StagesDraft,
  type SequenceDraft,
} from "./stages-model";
import type {
  StagesIntentRepository,
  StoredStagesIntent,
} from "./stages-storage";
export type StagesApi = {
  read: () => Promise<MobileApiReadResult<NutritionStages>>;
  write: (
    intent: StagesIntent,
  ) => Promise<MobileApiRequestResult<StagesResult>>;
  refreshToday: (date: string) => Promise<boolean>;
};
export type StagesState = {
  list: NutritionStages | null;
  loading: boolean;
  readError: boolean;
  phase:
    | "loading"
    | "idle"
    | "pending"
    | "uncertain"
    | "confirmed"
    | "conflict"
    | "blocked";
  draft: StagesDraft | null;
  editing: number | "maintenance" | null;
  intent: StoredStagesIntent | null;
  baseline: { today: string; listVersion: number } | null;
  message: string | null;
  notice: string | null;
  conflictCode: string | null;
};
export class StagesController {
  private originalDraft: string | null = null;
  private state: StagesState;
  private busy = false;
  private disposed = false;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(
    private api: StagesApi,
    private repository: StagesIntentRepository,
    private onConfirmed: () => void,
    initial: NutritionStages | null = null,
    private key: () => string = () =>
      `stages:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  ) {
    this.state = {
      list: initial,
      loading: false,
      readError: false,
      phase: "loading",
      draft: null,
      editing: null,
      intent: null,
      baseline: null,
      message: null,
      notice: null,
      conflictCode: null,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private update(patch: Partial<StagesState>) {
    if (!this.disposed) {
      this.state = { ...this.state, ...patch };
      this.listeners.forEach((f) => f());
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.listeners.clear();
  }
  adoptCached(list: NutritionStages) {
    const current = this.state.list;
    if (
      current === list ||
      (current &&
        (current.listVersion > list.listVersion || current.today > list.today))
    )
      return;
    this.update({ list, readError: false });
  }
  async initialize() {
    try {
      const stored = await this.repository.read();
      if (stored)
        this.update({
          intent: stored,
          draft: stored.draft,
          baseline: {
            today: stored.intent.date,
            listVersion: stored.intent.expectedListVersion,
          },
          phase: stored.receipt ? "confirmed" : "uncertain",
          message: stored.receipt
            ? "Se guardó. Falta mostrar tus etapas actualizadas."
            : "Tu cambio sigue acá. Comprobá si se guardó.",
        });
      else this.update({ phase: "idle" });
    } catch {
      this.update({
        phase: "blocked",
        message: "No pudimos recuperar el cambio guardado en este teléfono.",
      });
    }
  }
  async load() {
    const generation = ++this.generation;
    this.update({ loading: true });
    try {
      const result = await this.api.read();
      if (this.disposed || generation !== this.generation) return false;
      if (result.status === "ok") {
        this.adoptCached(result.data);
        this.update({ loading: false, readError: false });
        return true;
      }
    } catch {
      /* Keep the last confirmed data; unavailable is never empty. */
    }
    if (!this.disposed && generation === this.generation)
      this.update({ loading: false, readError: true });
    return false;
  }
  private editable() {
    return (
      !this.disposed &&
      !this.busy &&
      this.state.phase === "idle" &&
      !this.state.intent &&
      !!this.state.list
    );
  }
  private available() {
    return (
      !this.disposed &&
      !this.busy &&
      this.state.phase === "idle" &&
      !this.state.intent &&
      !!this.state.list &&
      !this.state.readError &&
      !this.state.loading
    );
  }
  private start(draft: StagesDraft) {
    if (!this.available()) return false;
    const list = this.state.list!;
    this.originalDraft = JSON.stringify(draft);
    this.update({
      draft,
      editing: null,
      baseline: { today: list.today, listVersion: list.listVersion },
      message: null,
      notice: null,
      conflictCode: null,
    });
    return true;
  }
  dirty() {
    return (
      !!this.state.draft &&
      JSON.stringify(this.state.draft) !== this.originalDraft
    );
  }
  replace(source?: NutritionStage, origin: "current" | "new" = "new") {
    const list = this.state.list;
    return list
      ? this.start({
          mode: "replace",
          origin,
          stage: stageDraft(list, source?.kind ?? null, source),
          future: list.upcoming.length ? null : "keep",
        })
      : false;
  }
  future(stage: NutritionStage) {
    const list = this.state.list;
    return list && stage.startsOn > list.today
      ? this.start({
          mode: "update",
          stageId: stage.id,
          stage: stageDraft(list, stage.kind, stage),
          startsOn: stage.startsOn,
          duration: stage.duration,
          sequenceId: stage.sequenceId,
        })
      : false;
  }
  sequence(template?: number, source?: NutritionStage) {
    return this.state.list
      ? this.start({
          mode: "sequence",
          sequence: sequenceDraft(this.state.list, template, source),
        })
      : false;
  }
  stage(): StageDraft | null {
    const d = this.state.draft;
    return !d
      ? null
      : d.mode !== "sequence"
        ? d.stage
        : this.state.editing === "maintenance"
          ? d.sequence.maintenanceStage
          : typeof this.state.editing === "number"
            ? (d.sequence.stages[this.state.editing]?.stage ?? null)
            : null;
  }
  editStage(index: number | "maintenance") {
    if (!this.editable() || this.state.draft?.mode !== "sequence") return;
    this.update({ editing: index, message: null });
  }
  changeStage(stage: StageDraft) {
    if (!this.editable() || !this.state.draft) return;
    const draft = this.state.draft;
    if (draft.mode === "sequence") {
      const sequence = { ...draft.sequence };
      if (this.state.editing === "maintenance")
        sequence.maintenanceStage = stage;
      else if (typeof this.state.editing === "number")
        sequence.stages = sequence.stages.map((s, i) =>
          i === this.state.editing ? { ...s, stage } : s,
        );
      else return;
      this.update({ draft: { ...draft, sequence }, message: null });
    } else this.update({ draft: { ...draft, stage }, message: null });
  }
  kind(kind: StageKind) {
    const stage = this.stage();
    if (stage && this.state.list)
      this.changeStage(chooseKind(stage, kind, this.state.list));
  }
  changeSequence(sequence: SequenceDraft) {
    if (this.editable() && this.state.draft?.mode === "sequence")
      this.update({ draft: { mode: "sequence", sequence }, message: null });
  }
  changeFutureDate(startsOn: string) {
    const d = this.state.draft;
    if (this.editable() && d?.mode === "update")
      this.update({ draft: { ...d, startsOn }, message: null });
  }
  changeFutureDuration(
    duration: NonNullable<Extract<StagesDraft, { mode: "update" }>["duration"]>,
  ) {
    const d = this.state.draft;
    if (this.editable() && d?.mode === "update" && d.duration)
      this.update({ draft: { ...d, duration }, message: null });
  }
  chooseFuture(future: "keep" | "cancel") {
    const d = this.state.draft;
    if (this.editable() && d?.mode === "replace")
      this.update({ draft: { ...d, future }, message: null });
  }
  discard() {
    if (this.busy || this.state.intent || this.state.phase === "blocked")
      return;
    this.update({
      draft: null,
      editing: null,
      baseline: null,
      message: null,
      phase: "idle",
      conflictCode: null,
    });
  }
  reviewTruth() {
    if (
      this.busy ||
      this.state.phase !== "conflict" ||
      this.state.readError ||
      this.state.loading ||
      !this.state.list
    )
      return;
    this.update({
      phase: "idle",
      baseline: {
        today: this.state.list.today,
        listVersion: this.state.list.listVersion,
      },
      message: "Revisá lo que armaste antes de guardar.",
      conflictCode: null,
    });
  }
  dismissNotice() {
    this.update({ notice: null });
  }
  async save() {
    if (!this.available() || !this.state.draft || !this.state.baseline) return;
    const d = this.state.draft,
      list = this.state.list!,
      base = {
        date: this.state.baseline.today,
        expectedListVersion: this.state.baseline.listVersion,
        idempotencyKey: this.key(),
      };
    let raw: unknown;
    if (d.mode === "replace") {
      if (!d.stage.kind) {
        this.update({ message: "Elegí qué tipo de plan es para guardarlo." });
        return;
      }
      if (list.upcoming.length && d.future === null) {
        this.update({ message: "Elegí qué hacer con las etapas programadas." });
        return;
      }
      raw = {
        ...base,
        operation: "replace_from_today",
        stage: stageFields(d.stage),
        future_stages: d.future ?? "keep",
      };
    }
    if (
      d.mode === "update" &&
      (!list.upcoming.some(
        (s) => s.id === d.stageId && s.startsOn > list.today,
      ) ||
        d.startsOn <= list.today)
    ) {
      this.update({
        message:
          "Esta etapa necesita una fecha futura. Si ya empezó, volvé a Etapas para cambiar desde hoy.",
      });
      return;
    }
    if (d.mode === "update")
      raw = {
        ...base,
        operation: "update_future",
        stageId: d.stageId,
        stage: stageFields(d.stage),
        startsOn: d.startsOn,
        duration: d.duration,
      };
    if (d.mode === "sequence") {
      if (scheduledCollision(list, d.sequence.startDate)) {
        this.update({
          message:
            "Ya tenés etapas desde esa fecha. Revisalas antes de programar.",
        });
        return;
      }
      if (!validSequence(d.sequence, list)) {
        this.update({
          message:
            "Completá los objetivos, el nombre y las fechas de cada etapa.",
        });
        return;
      }
      raw = {
        ...base,
        operation: "schedule_sequence",
        name: d.sequence.name,
        after_end: d.sequence.afterEnd,
        start_date: d.sequence.startDate,
        stages: d.sequence.stages.map((s) => ({
          ...stageFields(s.stage),
          duration: s.duration,
        })),
        maintenanceStage:
          d.sequence.afterEnd === "maintenance"
            ? stageFields(d.sequence.maintenanceStage)
            : null,
      };
    }
    const intent = parseStagesIntent(raw);
    if (!intent) {
      this.update({
        message: "Revisá el tipo, el nombre y los objetivos de los siete días.",
      });
      return;
    }
    await this.submit(intent);
  }
  async removeStage(stageId: string) {
    if (!this.available()) return;
    const list = this.state.list!;
    if (!list.upcoming.some((s) => s.id === stageId && s.startsOn > list.today))
      return;
    await this.submit({
      operation: "delete_future",
      date: this.state.baseline?.today ?? list.today,
      expectedListVersion: this.state.baseline?.listVersion ?? list.listVersion,
      idempotencyKey: this.key(),
      stageId,
    });
  }
  async cancelSequence(sequenceId: string) {
    if (!this.available()) return;
    const list = this.state.list!;
    if (!list.upcoming.some((s) => s.sequenceId === sequenceId)) return;
    await this.submit({
      operation: "cancel_sequence",
      date: this.state.baseline?.today ?? list.today,
      expectedListVersion: this.state.baseline?.listVersion ?? list.listVersion,
      idempotencyKey: this.key(),
      sequenceId,
    });
  }
  private async submit(intent: StagesIntent) {
    this.busy = true;
    const stored: StoredStagesIntent = {
      version: 1,
      intent,
      draft: this.state.draft,
    };
    this.update({ phase: "pending", message: null, notice: null });
    try {
      await this.repository.write(stored);
      if (this.disposed) return;
      this.update({ intent: stored });
      await this.send(stored);
    } catch {
      this.update({
        phase: this.state.intent?.receipt
          ? "confirmed"
          : this.state.intent
            ? "uncertain"
            : "blocked",
        message: this.state.intent?.receipt
          ? "Se guardó. Falta mostrar tus etapas actualizadas."
          : this.state.intent
            ? "Tu cambio sigue acá. Comprobá si se guardó."
            : "No pudimos guardar el cambio en este teléfono.",
      });
    } finally {
      this.busy = false;
    }
  }
  async recover() {
    if (this.busy || this.disposed) return;
    if (!this.state.intent) {
      await this.initialize();
      return;
    }
    this.busy = true;
    this.update({ phase: "pending", message: null });
    try {
      const stored = this.state.intent;
      if (stored.receipt) await this.confirmed(stored);
      else await this.send(stored);
    } catch {
      this.update({
        phase: this.state.intent?.receipt ? "confirmed" : "uncertain",
        message: this.state.intent?.receipt
          ? "Se guardó. Falta mostrar tus etapas actualizadas."
          : "Tu cambio sigue acá. Comprobá si se guardó.",
      });
    } finally {
      this.busy = false;
    }
  }
  private async send(stored: StoredStagesIntent) {
    const result = await this.api.write(stored.intent);
    if (this.disposed) return;
    if (result.status === "ok" && result.data.status === "confirmed") {
      const confirmed = { ...stored, receipt: result.data };
      this.adoptCached(result.data.list);
      this.update({ phase: "confirmed", intent: confirmed });
      await this.repository.write(confirmed);
      await this.confirmed(confirmed);
      return;
    }
    if (result.status === "conflict" && result.data?.status === "conflict") {
      await this.repository.clear(stored.intent.idempotencyKey);
      this.generation++;
      this.update({
        list: result.data.list,
        readError: false,
        loading: false,
        intent: null,
        phase: "conflict",
        conflictCode: result.code,
        message:
          result.code === "STAGES_DAY_CHANGED"
            ? "Cambió el día. Revisá desde cuándo empieza."
            : result.message,
      });
      return;
    }
    if (result.status === "validation") {
      await this.repository.clear(stored.intent.idempotencyKey);
      this.update({ intent: null, phase: "idle", message: result.message });
      return;
    }
    this.update({
      phase: "uncertain",
      message: "Tu cambio sigue acá. Comprobá si se guardó.",
    });
  }
  private async confirmed(stored: StoredStagesIntent) {
    const receipt = stored.receipt!;
    const [fresh, today] = await Promise.all([
      this.load(),
      this.api.refreshToday(receipt.date),
    ]);
    if (this.disposed) return;
    if (!fresh || !today) {
      this.update({
        phase: "confirmed",
        message: "Se guardó. Falta mostrar tus etapas actualizadas.",
      });
      return;
    }
    await this.repository.clear(stored.intent.idempotencyKey);
    if (this.disposed) return;
    const notice =
      receipt.operation === "schedule_sequence"
        ? `Programaste ${stored.intent.operation === "schedule_sequence" ? stored.intent.stages.length : ""} ${stored.intent.operation === "schedule_sequence" && stored.intent.stages.length === 1 ? "etapa" : "etapas"}.`
        : receipt.operation === "replace_from_today"
          ? "Plan guardado desde hoy."
          : receipt.operation === "update_future"
            ? "Etapa actualizada."
            : receipt.operation === "delete_future"
              ? "Etapa borrada."
              : "Secuencia cortada. Lo vivido no cambió.";
    const keepSequence =
      stored.draft?.mode === "sequence" &&
      (receipt.operation === "cancel_sequence" ||
        receipt.operation === "delete_future");
    this.update({
      phase: "idle",
      intent: null,
      draft: keepSequence ? stored.draft : null,
      editing: null,
      baseline:
        keepSequence && this.state.list
          ? {
              today: this.state.list.today,
              listVersion: this.state.list.listVersion,
            }
          : null,
      message: null,
      notice,
      conflictCode: null,
    });
    this.onConfirmed();
  }
}
