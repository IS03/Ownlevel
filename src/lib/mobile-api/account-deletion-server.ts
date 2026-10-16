import "server-only";
import { NextResponse } from "next/server";
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from "./auth";
import { authenticateMobileMutationAccessToken } from "./supabase";
import { mobileApiResponseHeaders, readMobileJson } from "./http";
import { parseAccountDeletionIntent, parseAccountDeletionReceipt } from "./account-deletion-contract";

const CONFIRM = "Para confirmar, escribí ELIMINAR.";

/**
 * DELETE /api/mobile/v1/account. Deletes the caller's data and Auth user in one database transaction
 * (ownlevel_private.delete_account). No service role: the owner-scoped RPC derives identity from the Bearer.
 * Naturally idempotent: a repeat after an uncertain response finds nothing left (or a rejected token).
 */
export async function accountDeletionResponse(request: Request) {
  let status = 503, body: unknown = { error: "DATA_UNAVAILABLE" };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get("authorization")));
    const intent = parseAccountDeletionIntent(await readMobileJson(request));
    if (!intent) throw new MobileApiValidationError(CONFIRM);
    const { data, error } = await auth.supabase.rpc("mobile_delete_account", { p_confirmation: intent.confirmation });
    if (error) {
      if (error.code === "22023") throw new MobileApiValidationError(CONFIRM);
      if (error.code === "PT401") throw new MobileApiUnauthorizedError();
      throw new Error("Delete unavailable");
    }
    const receipt = parseAccountDeletionReceipt(data);
    if (!receipt) throw new Error("Invalid delete response");
    status = 200; body = receipt;
  } catch (e) {
    if (e instanceof MobileApiUnauthorizedError) { status = 401; body = { error: "UNAUTHORIZED" }; }
    else if (e instanceof MobileApiValidationError) { status = 400; body = { error: "VALIDATION_ERROR", message: e.message }; }
    else console.warn("[mobile.account.delete] unavailable");
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
