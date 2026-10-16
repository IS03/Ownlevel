import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileMutationAccessToken } from "./supabase";
import { DELETE } from "@/app/api/mobile/v1/account/route";
import { parseAccountDeletionIntent, parseAccountDeletionReceipt } from "./account-deletion-contract";

const rpc = vi.fn();
const request = (body?: unknown, token = "Bearer token") => new NextRequest("https://www.ownlevel.fit/api/mobile/v1/account",
  { method: "DELETE", headers: { authorization: token, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(authenticateMobileMutationAccessToken).mockImplementation(async (token: string) => {
    if (!token) { const { MobileApiUnauthorizedError } = await import("./auth"); throw new MobileApiUnauthorizedError(); }
    return { userId: "owner", supabase: { rpc } } as never;
  });
});

describe("account deletion contract", () => {
  it("accepts only the exact typed confirmation, never a user id", () => {
    expect(parseAccountDeletionIntent({ confirmation: "ELIMINAR" })).toEqual({ confirmation: "ELIMINAR" });
    for (const bad of [{ confirmation: "eliminar" }, { confirmation: " ELIMINAR" }, {}, null, [], { confirmation: "ELIMINAR", userId: "other" }]) {
      expect(parseAccountDeletionIntent(bad)).toBeUndefined();
    }
    expect(parseAccountDeletionReceipt({ status: "deleted" })).toEqual({ status: "deleted" });
    expect(parseAccountDeletionReceipt({ status: "deleted", userId: "owner" })).toBeUndefined();
  });
});

describe("DELETE /api/mobile/v1/account", () => {
  it("deletes through the owner-scoped RPC with the confirmation only", async () => {
    rpc.mockResolvedValue({ data: { status: "deleted" }, error: null });
    const res = await DELETE(request({ confirmation: "ELIMINAR" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
    expect(authenticateMobileMutationAccessToken).toHaveBeenCalledWith("token");
    expect(rpc).toHaveBeenCalledWith("mobile_delete_account", { p_confirmation: "ELIMINAR" });
  });
  it("rejects a missing or wrong confirmation before touching data", async () => {
    for (const body of [undefined, { confirmation: "borrar" }, { confirmation: "ELIMINAR", userId: "other" }]) {
      const res = await DELETE(request(body));
      expect(res.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("401 without Bearer; unavailable (never a fake success) on database failure", async () => {
    expect((await DELETE(request({ confirmation: "ELIMINAR" }, ""))).status).toBe(401);
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect((await DELETE(request({ confirmation: "ELIMINAR" }))).status).toBe(503);
    rpc.mockResolvedValue({ data: { status: "gone" }, error: null });
    expect((await DELETE(request({ confirmation: "ELIMINAR" }))).status).toBe(503);
    rpc.mockResolvedValue({ data: null, error: { code: "PT401" } });
    expect((await DELETE(request({ confirmation: "ELIMINAR" }))).status).toBe(401);
  });
});
