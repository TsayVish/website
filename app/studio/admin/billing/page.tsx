import type { Metadata } from "next";
import { MoreLink } from "@/components/studio/MoreLink";
import { LEDGER_COLUMNS, LEDGER_LABEL, money, type LedgerRow } from "@/lib/billing";
import { billingEnv, isTestMode, paymentsReady } from "@/lib/billing-stripe";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

type Summary = { purchased_cents: number; spent_cents: number; provider_cents: number; outstanding_cents: number; buyers: number };

export default async function AdminBilling({ searchParams }: { searchParams: Promise<{ limit?: string; kind?: string }> }) {
  const sp = await searchParams;
  const limit = readLimit(sp.limit, 50);
  const kind = sp.kind === "purchase" || sp.kind === "charge" || sp.kind === "refund" ? sp.kind : null;
  const supabase = await createClient();
  let q = supabase.from("credit_ledger").select(LEDGER_COLUMNS).order("created_at", { ascending: false }).range(0, limit);
  if (kind) q = q.eq("kind", kind);
  const [{ data: sum, error }, { data: rows }, { data: markup }] = await Promise.all([supabase.rpc("billing_summary"), q, supabase.rpc("credit_markup")]);
  const s = ((Array.isArray(sum) ? sum[0] : sum) ?? {}) as Partial<Summary>;
  const page = splitPage(rows as LedgerRow[] | null, limit);
  const ids = [...new Set(page.items.map((r) => r.user_id))];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((ppl ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const env = billingEnv();
  const n = (v: unknown) => Number(v ?? 0);
  const margin = n(s.spent_cents) - n(s.provider_cents);
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const tiles = [
    { label: "Credits bought this month", value: money(n(s.purchased_cents)), sub: `${n(s.buyers)} buyer${n(s.buyers) === 1 ? "" : "s"}` },
    { label: "Credits spent this month", value: money(n(s.spent_cents)), sub: "after refunds" },
    { label: "AI provider cost this month", value: money(n(s.provider_cents)), sub: "what fal charges you" },
    { label: "Margin this month", value: money(margin), sub: `markup ${Number(markup) || 1.5}×` },
    { label: "Unspent credits", value: money(n(s.outstanding_cents)), sub: "all members" },
  ];

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Billing</h1><p className="st-sub">AI Studio credits: what people bought, what they spent, and what the AI provider costs.</p></div></div>
      {!paymentsReady(env) ? (
        <p className="ai-off">Payments aren’t switched on. Add <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> and <code>BILLING_DB_SECRET</code> in Vercel (see the README), then redeploy.</p>
      ) : (
        <p className="ai-hint">Stripe is connected{isTestMode(env) ? " in test mode (no real charges)" : " in live mode"}.{env.webhookSecret ? "" : " The webhook secret is missing, so purchases are only recorded when the buyer returns to the site."}</p>
      )}
      {error && <p className="form-error">{error.message}</p>}
      <div className="adm-tiles">
        {tiles.map((t) => <div key={t.label} className="adm-tile"><span>{t.label}</span><b>{t.value}</b><small>{t.sub}</small></div>)}
      </div>
      <nav className="st-tabs adm-filter" aria-label="Filter">
        {[[null, "All"], ["purchase", "Purchases"], ["charge", "Charges"], ["refund", "Refunds"]].map(([k, l]) => (
          <a key={l} href={k ? `/studio/admin/billing?kind=${k}` : "/studio/admin/billing"} aria-current={kind === k ? "page" : undefined}>{l}</a>
        ))}
      </nav>
      <div className="st-table">
        <div className="st-row st-row-head adm-bill-row" aria-hidden="true"><span>When</span><span>Member</span><span>What</span><span className="cr-amt">Amount</span></div>
        {page.items.map((r) => (
          <div key={r.id} className="st-row adm-bill-row">
            <span className="st-cell">{when(r.created_at)}</span>
            <span className="st-cell">{names.get(r.user_id) || "Member"}</span>
            <span className="st-proj-text"><b>{LEDGER_LABEL[r.kind]}</b>{r.note && r.note !== LEDGER_LABEL[r.kind] && <small>{r.note}</small>}</span>
            <span className={`cr-amt ${r.amount_cents > 0 ? "plus" : ""}`}>{r.amount_cents > 0 ? "+" : ""}{money(r.amount_cents)}</span>
          </div>
        ))}
        {page.items.length === 0 && <div className="st-row"><span className="st-cell">Nothing yet.</span></div>}
      </div>
      {page.hasMore && <MoreLink href={moreHref("/studio/admin/billing", { kind }, limit, 50)} />}
    </div>
  );
}
