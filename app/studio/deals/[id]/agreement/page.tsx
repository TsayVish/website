import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/studio/deals/PrintButton";
import { agreementClauses, readTerms } from "@/lib/agreement";
import { loadDeals } from "@/lib/deals";
import { fmtDate } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "License agreement" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "—");

/** The agreement as a clean document. "Download PDF" uses the browser's Save as PDF. */
export default async function AgreementDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [deal] = await loadDeals(supabase, { id });
  if (!deal) notFound();
  const { data: ag } = await supabase.from("agreements")
    .select("version, status, terms, seller_accepted_at, seller_signature, buyer_accepted_at, buyer_signature, updated_at")
    .eq("offer_id", id).maybeSingle();
  if (!ag) notFound();
  const a = ag as { version: number; status: string; terms: unknown; seller_accepted_at: string | null; seller_signature: string | null; buyer_accepted_at: string | null; buyer_signature: string | null; updated_at: string };
  const terms = readTerms(a.terms, Number(deal.offer.amount));
  const parties = {
    licensor: deal.seller?.full_name || deal.listing?.seller_name || "Seller",
    licensee: deal.buyer?.full_name || "Buyer",
    property: deal.listing?.title ?? "the listed item",
    kind: (deal.listing?.type === "service" ? "service" : "character") as "character" | "service",
    date: fmtDate(a.seller_accepted_at ?? a.updated_at),
  };
  const clauses = agreementClauses(terms, parties);

  return (
    <div className="ag-doc-wrap">
      <div className="ag-doc-bar no-print">
        <Link href={`/studio/deals/${id}#agreement`} className="btn ghost st-small">Back to the deal</Link>
        <PrintButton />
      </div>
      <article className="ag-doc">
        <header>
          <p className="ag-doc-eyebrow">tsayvish · {parties.kind === "character" ? "Character license agreement" : "Services agreement"}</p>
          <h1>{parties.property}</h1>
          <p>{parties.licensor} and {parties.licensee} · Version {a.version} · {a.status === "signed" ? "Signed by both parties" : "Not yet signed by both parties"}</p>
        </header>
        {clauses.map((c) => (
          <section key={c.heading}>
            <h2>{c.heading}</h2>
            <p>{c.text}</p>
          </section>
        ))}
        <section className="ag-doc-sigs">
          <div>
            <span>Licensor</span>
            <b className="ag-doc-sig">{a.seller_signature ?? " "}</b>
            <small>{parties.licensor} · {a.seller_accepted_at ? when(a.seller_accepted_at) : "Not signed"}</small>
          </div>
          <div>
            <span>Licensee</span>
            <b className="ag-doc-sig">{a.buyer_signature ?? " "}</b>
            <small>{parties.licensee} · {a.buyer_accepted_at ? when(a.buyer_accepted_at) : "Not signed"}</small>
          </div>
        </section>
        <footer>
          Agreement reference {id}. Signed electronically on tsayvish by typing names. This template is provided for convenience and isn’t legal advice.
        </footer>
      </article>
    </div>
  );
}
