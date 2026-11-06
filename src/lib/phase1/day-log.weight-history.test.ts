import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  deleteWeightHistoryEntry,
  listWeightHistory,
  recordWeightForDate,
  updateWeightHistoryEntry,
} from "./day-log";

type QueryResult = { data: unknown; error: { message: string } | null };

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "update", "eq", "not", "order", "limit"] as const) {
    builder[method].mockReturnValue(builder);
  }
  builder.single.mockResolvedValue(result);
  return builder;
}

describe("persistencia de historial de peso", () => {
  const userId = "user-1";
  let builder: ReturnType<typeof query>;
  const client = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  };

  beforeEach(() => {
    builder = query({
      data: [{ id: "day-1", log_date: "2026-08-11", weight_kg: 64.8 }],
      error: null,
    });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    client.from.mockReturnValue(builder);
    client.rpc.mockResolvedValue({
      data: { id: "day-1", log_date: "2026-08-11" },
      error: null,
    });
    mocks.createClient.mockResolvedValue(client);
    vi.clearAllMocks();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    client.from.mockReturnValue(builder);
    client.rpc.mockResolvedValue({
      data: { id: "day-1", log_date: "2026-08-11" },
      error: null,
    });
    mocks.createClient.mockResolvedValue(client);
  });

  it("lista sólo pesos no nulos del usuario autenticado, ordenados por fecha", async () => {
    await expect(listWeightHistory()).resolves.toEqual([
      { id: "day-1", log_date: "2026-08-11", weight_kg: 64.8 },
    ]);
    expect(client.from).toHaveBeenCalledWith("day_logs");
    expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
    expect(builder.not).toHaveBeenCalledWith("weight_kg", "is", null);
    // The newest window: read newest first, returned oldest first.
    expect(builder.order).toHaveBeenCalledWith("log_date", { ascending: false });
  });

  it("registra o reemplaza el peso de un único day log sin insertar duplicados", async () => {
    builder.single.mockResolvedValue({
      data: { id: "day-1", log_date: "2026-08-11", weight_kg: 64.8 },
      error: null,
    });
    await expect(recordWeightForDate({ date: "2026-08-11", weightKg: 64.8 })).resolves.toEqual({
      entry: { id: "day-1", log_date: "2026-08-11", weight_kg: 64.8 },
      currentWeightKg: 64.8,
      syncedCurrentWeight: true,
    });
    expect(client.rpc).toHaveBeenCalledWith("get_or_create_day_log", {
      p_log_date: "2026-08-11",
    });
    expect(builder.update).toHaveBeenCalledWith({ weight_kg: 64.8 });
  });

  it("rechaza registrar o editar peso en una fecha futura (día Córdoba) sin tocar day_logs", async () => {
    await expect(recordWeightForDate({ date: "2999-01-01", weightKg: 64.8 })).rejects.toThrow("fecha futura");
    await expect(updateWeightHistoryEntry({ logDate: "2999-01-01", weightKg: 64.8 })).rejects.toThrow("fecha futura");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("editar y eliminar sólo cambian weight_kg y siempre acotan la fila al usuario", async () => {
    builder.single.mockResolvedValue({
      data: { id: "day-1", log_date: "2026-08-11", weight_kg: 65 },
      error: null,
    });
    await updateWeightHistoryEntry({ logDate: "2026-08-11", weightKg: 65 });
    expect(builder.update).toHaveBeenCalledWith({ weight_kg: 65 });
    expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
    expect(builder.eq).toHaveBeenCalledWith("log_date", "2026-08-11");

    await deleteWeightHistoryEntry("2026-08-11");
    expect(builder.update).toHaveBeenLastCalledWith({ weight_kg: null });
    expect(client.from).toHaveBeenCalledWith("day_logs");
  });

  it("sólo sincroniza el perfil al editar el registro cronológicamente más reciente", async () => {
    const updateBuilder = query({ data: { id: "old", log_date: "2026-08-10", weight_kg: 64.5 }, error: null });
    const latestBuilder = query({ data: [{ id: "new", log_date: "2026-08-13", weight_kg: 65.2 }], error: null });
    client.from.mockReturnValueOnce(updateBuilder).mockReturnValueOnce(latestBuilder);

    const result = await updateWeightHistoryEntry({ logDate: "2026-08-10", weightKg: 64.5 });
    expect(result.syncedCurrentWeight).toBe(false);

    const latestUpdateBuilder = query({ data: { id: "new", log_date: "2026-08-13", weight_kg: 64.8 }, error: null });
    const sameLatestBuilder = query({ data: [{ id: "new", log_date: "2026-08-13", weight_kg: 64.8 }], error: null });
    client.from.mockReturnValueOnce(latestUpdateBuilder).mockReturnValueOnce(sameLatestBuilder);
    const latestResult = await updateWeightHistoryEntry({ logDate: "2026-08-13", weightKg: 64.8 });
    expect(latestResult).toMatchObject({ currentWeightKg: 64.8, syncedCurrentWeight: true });
  });

  it("al eliminar el último peso toma el anterior; si no queda ninguno limpia el perfil", async () => {
    const before = query({ data: [{ id: "new", log_date: "2026-08-13", weight_kg: 65.2 }], error: null });
    const removal = query({ data: null, error: null });
    const after = query({ data: [{ id: "old", log_date: "2026-08-10", weight_kg: 64.5 }], error: null });
    client.from.mockReturnValueOnce(before).mockReturnValueOnce(removal).mockReturnValueOnce(after);
    await expect(deleteWeightHistoryEntry("2026-08-13")).resolves.toMatchObject({ currentWeightKg: 64.5, syncedCurrentWeight: true });

    const lastBefore = query({ data: [{ id: "only", log_date: "2026-08-13", weight_kg: 65.2 }], error: null });
    const lastRemoval = query({ data: null, error: null });
    const noneAfter = query({ data: [], error: null });
    client.from.mockReturnValueOnce(lastBefore).mockReturnValueOnce(lastRemoval).mockReturnValueOnce(noneAfter);
    await expect(deleteWeightHistoryEntry("2026-08-13")).resolves.toMatchObject({ currentWeightKg: null, syncedCurrentWeight: true });
  });
});
