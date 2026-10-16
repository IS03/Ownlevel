"use client";

import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { brandAssets, brandSymbolSize } from "@/lib/brand";
import {
  googleOAuthRequest,
  PUBLIC_AUTH_ERROR_MESSAGE,
} from "@/lib/security/google-oauth";

type LoginFormProps = {
  authError?: boolean;
  next?: string;
  /** Neutral notice (not an error), e.g. after deleting the account. */
  notice?: string | null;
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M21.8 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.5a4.7 4.7 0 0 1-2.04 3.08v2.52h3.31c1.94-1.79 3.03-4.43 3.03-7.43Z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.06-.91 6.75-2.34l-3.3-2.52c-.92.61-2.09.97-3.45.97-2.66 0-4.91-1.8-5.72-4.22H2.87v2.6A10.2 10.2 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.28 13.9A6.1 6.1 0 0 1 5.96 12c0-.66.11-1.3.32-1.9V7.5H2.87A10.2 10.2 0 0 0 1.8 12c0 1.63.39 3.17 1.07 4.5l3.41-2.6Z" />
      <path fill="#EA4335" d="M12 5.89c1.49 0 2.83.51 3.89 1.52l2.92-2.92C17.06 2.86 14.75 2 12 2a10.2 10.2 0 0 0-9.13 5.5l3.41 2.6C7.09 7.69 9.34 5.89 12 5.89Z" />
    </svg>
  );
}

export function LoginForm({ authError, next, notice }: LoginFormProps) {
  const [error, setError] = useState<string | null>(
    authError ? PUBLIC_AUTH_ERROR_MESSAGE : null,
  );
  const [pending, setPending] = useState(false);

  async function handleGoogle() {
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth(
        googleOAuthRequest(window.location.origin, next),
      );

      if (oauthError) {
        console.error("[auth] Google OAuth could not be initialized");
        setError(PUBLIC_AUTH_ERROR_MESSAGE);
        setPending(false);
      }
      // Si no hay error, Supabase redirige al proveedor; no seguimos ejecutando UI.
    } catch {
      console.error("[auth] Google OAuth initialization failed");
      setError(PUBLIC_AUTH_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-max(3rem,calc(2rem+env(safe-area-inset-top)+env(safe-area-inset-bottom))))] w-full flex-col py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 lg:grid lg:min-h-[min(44rem,calc(100dvh-6rem))] lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] lg:grid-rows-[1fr_auto] lg:gap-10 lg:gap-x-20 lg:py-10">
      <section className="flex max-w-xl flex-col pt-[clamp(4rem,12vh,7rem)] lg:justify-center lg:py-12" aria-labelledby="login-title">
        <div className="flex items-center gap-3">
          <Image
            src={brandAssets.symbolOnLight}
            width={brandSymbolSize.width}
            height={brandSymbolSize.height}
            alt=""
            aria-hidden
            className="h-12 w-auto object-contain dark:hidden"
          />
          <Image
            src={brandAssets.symbolOnDark}
            width={brandSymbolSize.width}
            height={brandSymbolSize.height}
            alt=""
            aria-hidden
            className="hidden h-12 w-auto object-contain dark:block"
          />
          <p className="text-sm font-bold tracking-[0.16em] text-foreground">OWNLEVEL</p>
        </div>
        <div className="mt-8 space-y-3 sm:mt-10">
          <h1 id="login-title" className="max-w-[16ch] text-3xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance sm:text-4xl lg:text-5xl">
            Entrenamiento, nutrición y progreso.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-foreground/70 sm:text-lg">
            Todo en un solo lugar.
          </p>
        </div>
      </section>

      <section className="mt-10 flex flex-col justify-center sm:mt-12 lg:mt-0 lg:border-l lg:border-border/70 lg:pl-12">
        <div className="w-full max-w-md lg:mx-auto">
          <p className="mb-2 text-sm font-semibold text-foreground">Entrá a OWNLEVEL</p>
          <p className="text-sm leading-relaxed text-foreground/70">
            Usá tu cuenta de Google para continuar.
          </p>
          <div className="mt-7">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-xl border-border/80 bg-card px-4 font-semibold shadow-[0_1px_2px_oklch(0_0_0_/_0.06),0_8px_18px_-16px_oklch(0_0_0_/_0.4)] hover:-translate-y-px hover:border-primary/35 hover:bg-muted/45 hover:shadow-[0_8px_20px_-16px_oklch(0_0_0_/_0.42)] dark:bg-card"
              onClick={handleGoogle}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden /> Redirigiendo…
                </>
              ) : (
                <>
                  <GoogleMark />
                  Continuar con Google
                </>
              )}
            </Button>
          </div>
          <div className="mt-3 min-h-[3.5rem]" aria-live="polite">
            {error ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-relaxed text-destructive" role="alert">
                {error}
              </p>
            ) : notice ? (
              <p className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground">
                {notice}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="mt-auto pt-10 text-sm leading-relaxed text-foreground/65 sm:pt-12 lg:col-span-2 lg:mt-0 lg:pt-0">
        <p>Tu progreso. Tus datos. Tu nivel.</p>
      </footer>
    </main>
  );
}
