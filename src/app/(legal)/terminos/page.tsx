import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { TERMS } from "@/lib/legal/content";

export const metadata: Metadata = { title: "Términos y condiciones", description: "Las condiciones de uso de OWNLEVEL." };

export default function TermsPage() {
  return <LegalPage doc={TERMS} other={{ href: "/privacidad", label: "la Política de privacidad" }} />;
}
