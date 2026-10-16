import { LoginForm } from "./login-form";
import { safeAuthRedirectPath } from "@/lib/security/auth-redirect";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string; cuenta?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authError = params.error === "auth";

  const notice = params.cuenta === "eliminada" ? "Tu cuenta y todo lo que registraste se eliminaron." : null;

  return <LoginForm authError={authError} next={safeAuthRedirectPath(params.next)} notice={notice} />;
}
