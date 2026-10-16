// Account deletion contract, shared by the Mobile API adapter and Expo (pure; no server imports).
// Identity comes only from the Bearer token; the body carries the typed confirmation and nothing else.

export const ACCOUNT_DELETION_CONFIRMATION = "ELIMINAR";
export type AccountDeletionIntent = { confirmation: typeof ACCOUNT_DELETION_CONFIRMATION };
export type AccountDeletionReceipt = { status: "deleted" };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseAccountDeletionIntent(v: unknown): AccountDeletionIntent | undefined {
  if (!record(v) || Object.keys(v).length !== 1 || v.confirmation !== ACCOUNT_DELETION_CONFIRMATION) return;
  return { confirmation: ACCOUNT_DELETION_CONFIRMATION };
}

export function parseAccountDeletionReceipt(v: unknown): AccountDeletionReceipt | undefined {
  if (!record(v) || Object.keys(v).length !== 1 || v.status !== "deleted") return;
  return { status: "deleted" };
}
