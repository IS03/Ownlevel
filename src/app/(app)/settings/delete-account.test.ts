import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.fn(), signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, auth: { signOut } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
import { deleteAccount } from "./actions";

const form = (confirmation: string) => { const f = new FormData(); f.set("confirmation", confirmation); return f; };

describe("Web · eliminar cuenta", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does nothing until ELIMINAR is typed", async () => {
    expect(await deleteAccount({ error: null }, form("borrar"))).toEqual({ error: "Para confirmar, escribí ELIMINAR." });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("deletes with the same RPC as the app, clears the session and lands on the login with a neutral notice", async () => {
    rpc.mockResolvedValue({ data: { status: "deleted" }, error: null });
    await expect(deleteAccount({ error: null }, form(" eliminar "))).rejects.toThrow("REDIRECT /login?cuenta=eliminada");
    expect(rpc).toHaveBeenCalledWith("mobile_delete_account", { p_confirmation: "ELIMINAR" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("an uncertain result keeps you here with a safe retry, never a fake success", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    const state = await deleteAccount({ error: null }, form("ELIMINAR"));
    expect(state.error).toContain("Probá de nuevo");
    expect(signOut).not.toHaveBeenCalled();
  });
});
