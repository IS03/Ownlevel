"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export type DeleteAccountState = { error: string | null };

/** Deletes the signed-in account and all its data (Web and app) in one database transaction. Safe to repeat. */
export async function deleteAccount(_previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const typed = String(formData.get("confirmation") ?? "").trim().toLocaleUpperCase("es-AR");
  if (typed !== "ELIMINAR") return { error: "Para confirmar, escribí ELIMINAR." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mobile_delete_account", { p_confirmation: "ELIMINAR" });
  if (error || !data || (data as { status?: string }).status !== "deleted") {
    return { error: "No pudimos confirmar si se eliminó. Probá de nuevo: si ya se borró, no se repite nada." };
  }
  // The Auth user no longer exists: only the local session is left to clear.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  revalidatePath("/", "layout");
  redirect("/login?cuenta=eliminada");
}
