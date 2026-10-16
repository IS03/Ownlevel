import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const settings = source("src/app/(app)/settings/page.tsx");
const application = source("src/app/(app)/settings/application/page.tsx");
const account = source("src/app/(app)/settings/account/page.tsx");
const library = source("src/app/(app)/settings/library/page.tsx");
const profilePage = source("src/app/(app)/settings/profile/page.tsx");
const profileOverview = source("src/app/(app)/settings/profile/profile-overview.tsx");
const profileForm = source("src/app/(app)/settings/profile-form.tsx");
const theme = source("src/app/(app)/settings/theme-settings.tsx");

describe("PR70 — Ajustes, Perfil y Aplicación", () => {
  it("agrupa el hub en Perfil, Tu plan, Preferencias y Cuenta", () => {
    expect(settings).toContain("Tu cuenta, tu plan y tus preferencias de OWNLEVEL.");
    expect(settings).toContain('href="/settings/profile"');
    expect(settings).toContain('title="Plan nutricional"');
    expect(settings).toContain('title="Biblioteca"');
    expect(settings).toContain('title="Métricas diarias"');
    expect(settings.match(/title="Aplicación"/g)).toHaveLength(1);
    expect(settings).not.toContain('title="Apariencia"');
    expect(settings).not.toContain('title="Integraciones"');
    expect(settings).toContain('title="Cuenta y seguridad"');
    expect(settings).not.toContain("Gasto estimado");
    expect(settings).not.toContain("Horario laboral");
  });

  it("mantiene navegación útil y marca las funciones futuras sin controles falsos", () => {
    expect(settings).toContain('href="/settings/nutrition"');
    expect(settings).toContain('href="/settings/library"');
    expect(settings).toContain('href="/settings/metrics"');
    expect(settings).toContain('href="/settings/application"');
    expect(settings).toContain('href="/settings/account"');
    expect(library).toContain('href="/settings/nutrition/foods"');
    expect(library).toContain('href="/settings/nutrition/meals"');
  });

  it("reutiliza el selector real de tema y el estado real de ChatGPT", () => {
    expect(application).toContain("<ThemeSettings />");
    expect(application).toContain("listIntegrationApiTokens()");
    expect(application).toContain("token.revoked_at === null");
    expect(application).toContain('href="/settings/nutrition/integrations"');
    expect(theme).toContain('role="group" aria-label="Tema"');
    expect(theme).toContain("setTheme(id)");
    expect(theme).toContain("theme === \"system\"");
  });

  it("comunica idioma y notificaciones sin implementar i18n ni permisos", () => {
    expect(application).toContain('title="Idioma"');
    expect(application).toContain("Español · Inglés próximamente");
    expect(application).toContain('title="Notificaciones"');
    expect(application).toContain("Disponible próximamente");
    expect(application).not.toContain("requestPermission");
  });

  it("Perfil usa fuentes reales, tolera ausencias y edita con el formulario canónico", () => {
    expect(profilePage).toContain("getProfileForUser(user.id)");
    expect(profilePage).toContain("getLatestBodyMeasurement()");
    expect(profilePage).toContain("latestMeasurement?.waist_cm ?? null");
    expect(profileOverview).toContain('return "Sin cargar"');
    expect(profileOverview).toContain("profile?.current_weight_kg");
    expect(profileOverview).toContain("profile?.bmr_kcal_current != null");
    expect(profileOverview).toContain('href="/train/body"');
    expect(profileOverview).toContain("<ProfileForm profile={profile}");
    expect(profileOverview).not.toContain("Ignacio Senestrari");
    expect(profileForm).toContain("saveProfileAction");
  });

  it("Cuenta conserva la cuenta conectada y el cierre de sesión real", () => {
    expect(account).toContain("getAuthedUser()");
    expect(account).toContain("form action={signOut}");
    expect(account).toContain("Cerrar sesión en este dispositivo");
    expect(account).toContain("<DeleteAccountForm />");
  });
});
