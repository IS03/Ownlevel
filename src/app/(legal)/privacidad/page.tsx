import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { PRIVACY } from "@/lib/legal/content";

export const metadata: Metadata = { title: "Política de privacidad", description: "Qué datos guarda OWNLEVEL, para qué y qué podés hacer con ellos." };

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ href: "/terminos", label: "los Términos y condiciones" }} />;
}
