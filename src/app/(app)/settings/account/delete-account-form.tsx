"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteAccount, type DeleteAccountState } from "../actions";

const initial: DeleteAccountState = { error: null };

/** Same as the app (AJ7): honest, no guilt; typing ELIMINAR enables the only destructive action. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLocaleUpperCase("es-AR") === "ELIMINAR";
  return (
    <form action={action} className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Eliminar cuenta</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Se borra tu cuenta de OWNLEVEL y todo lo que registraste, acá y en la app: entrenamientos, comidas, peso, medidas,
        métricas, tu plan y tus ajustes. No se puede deshacer.
      </p>
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted-foreground">Para confirmar, escribí ELIMINAR</span>
        <input
          name="confirmation"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={pending}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {state.error ? <p className="text-sm text-foreground" aria-live="polite">{state.error}</p> : null}
      <Button type="submit" variant="destructive" className="h-11 w-full" disabled={!confirmed || pending}>
        {pending ? "Eliminando…" : "Eliminar mi cuenta"}
      </Button>
    </form>
  );
}
