import { describe, expect, it, jest } from "@jest/globals";
import { StagesController, type StagesApi } from "./stages-controller";
import { StagesIntentRepository } from "./stages-storage";
import { stagesFixture, stageId } from "./stages-fixture.test-helper";
import type { NutritionStages } from "@/api/nutrition-stages";
const meta = { durationMs: 1, httpStatus: 200, outcome: "ok" as const };
const ok = <T>(data: T) => ({ status: "ok" as const, data, meta });
const unavailable = {
  status: "unavailable" as const,
  reason: "network" as const,
  meta: { ...meta, outcome: "unavailable" as const },
};
function setup(
  list = stagesFixture(),
  user = "owner",
  memory = new Map<string, string>(),
) {
  const storage = {
    getItem: jest.fn(async (key: string) => memory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      memory.delete(key);
    }),
  };
  const api: StagesApi = {
    read: jest.fn<StagesApi["read"]>().mockResolvedValue(ok(list)),
    write: jest.fn<StagesApi["write"]>().mockImplementation(async (i) =>
      ok({
        status: "confirmed",
        operation: i.operation,
        date: i.date,
        list: { ...list, listVersion: list.listVersion + 1 },
      }),
    ),
    refreshToday: jest.fn<StagesApi["refreshToday"]>().mockResolvedValue(true),
  };
  const repository = new StagesIntentRepository(storage, user),
    confirm = jest.fn();
  let key = 0;
  const controller = new StagesController(
    api,
    repository,
    confirm,
    list,
    () => `stages:test:${++key}`,
  );
  return { controller, api, storage, repository, memory, confirm };
}
describe("Durable stage mutations", () => {
  it("untyped plan cannot save before a real selection; original name and objectives are sent unchanged", async () => {
    const list = stagesFixture({ untyped: true }),
      x = setup(list);
    await x.controller.initialize();
    x.controller.replace(list.current!, "current");
    await x.controller.save();
    expect(x.api.write).not.toHaveBeenCalled();
    x.controller.kind("deficit");
    await x.controller.save();
    expect(x.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "replace_from_today",
        stage: expect.objectContaining({
          kind: "deficit",
          name: list.current!.name,
          weekdays: list.current!.weekdays,
        }),
      }),
    );
  });
  it.each(["keep", "cancel"] as const)(
    "future stages require explicit %s; durable intent exists before sending",
    async (future) => {
      const list = stagesFixture({ future: true }),
        x = setup(list);
      await x.controller.initialize();
      x.controller.replace(list.current!, "current");
      await x.controller.save();
      expect(x.api.write).not.toHaveBeenCalled();
      x.controller.chooseFuture(future);
      jest.mocked(x.api.write).mockImplementation(async (i) => {
        expect((await x.repository.read())?.intent).toEqual(i);
        return ok({
          status: "confirmed",
          operation: i.operation,
          date: i.date,
          list,
        });
      });
      await x.controller.save();
      expect(x.api.write).toHaveBeenCalledWith(
        expect.objectContaining({
          future_stages: future,
          expectedListVersion: 7,
        }),
      );
      expect(x.confirm).toHaveBeenCalledTimes(1);
    },
  );
  it("ambiguous result survives restart, is never sent by initialize/load, and recovery uses exactly the same key and intent", async () => {
    const x = setup();
    await x.controller.initialize();
    x.controller.replace(x.controller.getSnapshot().list!.current!, "current");
    jest.mocked(x.api.write).mockResolvedValueOnce(unavailable);
    await x.controller.save();
    const stored = await x.repository.read();
    expect(stored).not.toBeNull();
    expect(x.controller.getSnapshot().phase).toBe("uncertain");
    const restored = new StagesController(x.api, x.repository, x.confirm);
    await restored.initialize();
    await restored.load();
    expect(x.api.write).toHaveBeenCalledTimes(1);
    await restored.recover();
    expect(jest.mocked(x.api.write).mock.calls[1][0]).toEqual(stored!.intent);
    expect(await x.repository.read()).toBeNull();
  });
  it.each(["STAGES_CHANGED", "STAGES_DAY_CHANGED"] as const)(
    "%s shows server truth, keeps draft, and only explicit review rebases",
    async (code) => {
      const x = setup();
      await x.controller.initialize();
      x.controller.sequence(0);
      const draft = x.controller.getSnapshot().draft;
      const truth = {
        ...stagesFixture(),
        listVersion: 50,
        today: code === "STAGES_DAY_CHANGED" ? "2026-10-17" : "2026-10-16",
      };
      jest.mocked(x.api.write).mockResolvedValueOnce({
        status: "conflict",
        code,
        message: "La lista cambió.",
        data: {
          status: "conflict",
          error: code,
          message: "La lista cambió.",
          list: truth,
        },
        meta,
      });
      await x.controller.save();
      expect(x.controller.getSnapshot()).toMatchObject({
        phase: "conflict",
        draft,
        list: truth,
        intent: null,
      });
      expect(x.controller.getSnapshot().baseline?.listVersion).toBe(7);
      expect(x.api.write).toHaveBeenCalledTimes(1);
      if (code === "STAGES_DAY_CHANGED")
        expect(x.controller.getSnapshot().message).toBe(
          "Cambió el día. Revisá desde cuándo empieza.",
        );
      x.controller.reviewTruth();
      expect(x.controller.getSnapshot().baseline).toEqual({
        today: truth.today,
        listVersion: 50,
      });
      expect(x.controller.getSnapshot().draft).toEqual(draft);
    },
  );
  it("overlap is caught before POST, and explicitly cutting keeps the sequence without scheduling it", async () => {
    const list = stagesFixture({ future: true }),
      x = setup(list);
    await x.controller.initialize();
    x.controller.sequence(0);
    await x.controller.save();
    expect(x.api.write).not.toHaveBeenCalled();
    jest.mocked(x.api.read).mockResolvedValueOnce(ok(stagesFixture()));
    await x.controller.cancelSequence(stageId(9));
    expect(x.api.write).toHaveBeenCalledTimes(1);
    expect(x.controller.getSnapshot().draft?.mode).toBe("sequence");
    expect(x.controller.getSnapshot().notice).toContain("Secuencia cortada");
  });
  it("deleting in the middle surfaces the exact server message, without shifting stages locally", async () => {
    const list = stagesFixture({ future: true }),
      x = setup(list);
    await x.controller.initialize();
    x.controller.future(list.upcoming[0]);
    const message = "Borrá desde la última etapa o cortá la secuencia.";
    jest
      .mocked(x.api.write)
      .mockResolvedValueOnce({ status: "validation", message, meta });
    await x.controller.removeStage(stageId(2));
    expect(x.controller.getSnapshot()).toMatchObject({
      phase: "idle",
      message,
      list,
      draft: { mode: "update" },
    });
    expect(await x.repository.read()).toBeNull();
  });
  it("only future stages can be edited/deleted; no mutation for historical or current ids", async () => {
    const x = setup();
    await x.controller.initialize();
    const current = x.controller.getSnapshot().list!.current!;
    expect(x.controller.future(current)).toBe(false);
    await x.controller.removeStage(current.id);
    expect(x.api.write).not.toHaveBeenCalled();
  });
  it("duplicating an untyped past stage requires an explicit kind and leaves the source untouched", async () => {
    const list = stagesFixture({ untyped: true });
    const past = {
      ...list.current!,
      id: stageId(3),
      status: "past" as const,
      startsOn: "2026-01-01",
      endsOn: "2026-09-29",
    };
    list.past = [past];
    const x = setup(list);
    await x.controller.initialize();
    x.controller.replace(past, "new");
    await x.controller.save();
    expect(x.api.write).not.toHaveBeenCalled();
    x.controller.kind("custom");
    await x.controller.save();
    expect(x.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "replace_from_today",
        stage: expect.objectContaining({
          kind: "custom",
          name: past.name,
          weekdays: past.weekdays,
        }),
      }),
    );
    expect(past.kind).toBeNull();
    expect(list.past).toEqual([past]);
  });
  it("future edits use update_future with the same identity and explicit date/duration, never the configuration plan write", async () => {
    const list = stagesFixture({ future: true }),
      x = setup(list);
    await x.controller.initialize();
    x.controller.future(list.upcoming[0]);
    x.controller.changeFutureDate("2026-12-23");
    x.controller.changeFutureDuration({ unit: "weeks", value: 4 });
    await x.controller.save();
    expect(x.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update_future",
        stageId: stageId(2),
        startsOn: "2026-12-23",
        duration: { unit: "weeks", value: 4 },
        stage: expect.objectContaining({
          name: list.upcoming[0].name,
          kind: "surplus",
        }),
      }),
    );
  });
  it("background reads allow local edits but never silently rebase a destructive write", async () => {
    const list = stagesFixture({ future: true }),
      x = setup(list);
    await x.controller.initialize();
    x.controller.future(list.upcoming[0]);
    let resolve!: (v: ReturnType<typeof ok<NutritionStages>>) => void;
    jest.mocked(x.api.read).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const refreshing = x.controller.load();
    x.controller.changeStage({
      ...x.controller.stage()!,
      name: "Objetivo que sigue acá",
    });
    expect(x.controller.stage()?.name).toBe("Objetivo que sigue acá");
    resolve(ok({ ...list, listVersion: 10 }));
    await refreshing;
    await x.controller.removeStage(stageId(2));
    expect(x.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedListVersion: 7,
        operation: "delete_future",
      }),
    );
  });
  it("confirmed receipt with failed refresh is recovered by reads only, not by a second POST", async () => {
    const x = setup();
    await x.controller.initialize();
    x.controller.sequence(0);
    jest.mocked(x.api.refreshToday).mockResolvedValueOnce(false);
    await x.controller.save();
    expect(x.controller.getSnapshot().phase).toBe("confirmed");
    expect((await x.repository.read())?.receipt).toBeDefined();
    await x.controller.recover();
    expect(x.api.write).toHaveBeenCalledTimes(1);
    expect(x.confirm).toHaveBeenCalledTimes(1);
  });
  it("local storage failure blocks before transmission and namespaces never cross users", async () => {
    const x = setup();
    await x.controller.initialize();
    x.controller.sequence(0);
    x.storage.setItem.mockRejectedValueOnce(new Error("disk"));
    await x.controller.save();
    expect(x.api.write).not.toHaveBeenCalled();
    expect(x.controller.getSnapshot().phase).toBe("blocked");
    const y = setup(stagesFixture(), "other", x.memory);
    await y.controller.initialize();
    expect(y.controller.getSnapshot()).toMatchObject({
      phase: "idle",
      intent: null,
    });
  });
  it("out-of-order reads never replace newer truth or a locally edited draft", async () => {
    const x = setup();
    await x.controller.initialize();
    x.controller.sequence(0);
    const draft = x.controller.getSnapshot().draft;
    let resolve!: (v: ReturnType<typeof ok<NutritionStages>>) => void;
    jest.mocked(x.api.read).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const old = x.controller.load();
    jest
      .mocked(x.api.read)
      .mockResolvedValueOnce(ok({ ...stagesFixture(), listVersion: 99 }));
    await x.controller.load();
    resolve(ok(stagesFixture()));
    await old;
    expect(x.controller.getSnapshot()).toMatchObject({
      list: { listVersion: 99 },
      draft,
    });
  });
});
