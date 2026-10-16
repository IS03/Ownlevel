import Link from "next/link";
import { LEGAL_UPDATED, type LegalDocument } from "@/lib/legal/content";

/** Public legal page: readable on a phone (the app opens it in its browser), no session needed. */
export function LegalPage({ doc, other }: { doc: LegalDocument; other: { href: string; label: string } }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <p className="text-sm font-semibold tracking-widest text-muted-foreground">OWNLEVEL</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: {LEGAL_UPDATED}</p>
      <p className="mt-8 text-lg leading-relaxed text-foreground">{doc.intro}</p>
      {doc.sections.map((section) => (
        <section key={section.title} className="mt-10 border-t border-border pt-6">
          <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="mt-3 leading-relaxed text-foreground/90">{p}</p>
          ))}
          {section.items ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground/90">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
        También podés leer <Link className="underline underline-offset-4" href={other.href}>{other.label}</Link>.
      </p>
    </main>
  );
}
