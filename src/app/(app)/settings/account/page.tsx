import { Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthedUser } from "@/lib/phase1/profile";
import { signOut } from "../actions";
import { SettingsHeader } from "../settings-components";
import { DeleteAccountForm } from "./delete-account-form";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const user = await getAuthedUser();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <SettingsHeader
        title="Cuenta y seguridad"
        description="Tu acceso actual a OWNLEVEL."
        backHref="/settings"
      />
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/8">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Cuenta conectada</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email ?? "—"}</p>
          </div>
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
        </div>
        <form action={signOut} className="border-t border-border/70 p-4">
          <Button type="submit" variant="outline" className="h-11 w-full">
            Cerrar sesión en este dispositivo
          </Button>
        </form>
      </section>
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/8">
        <DeleteAccountForm />
      </section>
    </div>
  );
}
