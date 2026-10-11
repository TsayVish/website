import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, legalDoc } from "@/lib/legal";

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = legalDoc((await params).doc);
  return d ? { title: d.title, description: d.summary } : { title: "Not found" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = legalDoc((await params).doc);
  if (!d) notFound();
  return (
    <div className="pub-wrap lg">
      <nav className="lg-nav" aria-label="Legal pages">
        {LEGAL_DOCS.map((x) => <Link key={x.slug} href={`/legal/${x.slug}`} aria-current={x.slug === d.slug ? "page" : undefined}>{x.title}</Link>)}
      </nav>
      <article className="lg-doc">
        <p className="lg-draft" role="note">Draft: this page hasn’t been reviewed by a lawyer yet and may change before launch.</p>
        <h1>{d.title}</h1>
        <p className="st-muted">Last updated {d.updated}</p>
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </article>
    </div>
  );
}
