import type { Metadata } from "next";
import Link from "next/link";
import { BuyCredits } from "@/components/studio/billing/BuyCredits";
import { MoreLink } from "@/components/studio/MoreLink";
import { DEFAULT_MARKUP, LEDGER_COLUMNS, LEDGER_LABEL, money, priceFor, type LedgerRow } from "@/lib/billing";
import { billingEnv, getCheckout, isTestMode, paidCredits, paymentsReady } from "@/lib/billing-stripe";
import { recordPurchase } from "@/lib/billing-server";
import { fmtDate } from "@/lib/hub";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Credits" };

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ session_id?: string; canceled?: string; limit?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const env = billingEnv();
  const ready = paymentsReady(env);

  // Back from Stripe: add the credits now rather than waiting for the webhook (it's safe to do both).
  let banner: { tone: "ok" | "warn"; text: string } | null = null;
  if (sp.session_id && ready && user) {
    try {
      const paid = paidCredits(await getCheckout(env, sp.session_id));
      if (paid && paid.userId === user.id) {
        await recordPurchase(supabase, env, paid);
        banner = { tone: "ok", text: `Payment received. ${money(paid.cents)} of credits added.` };
      } else {
        banner = { tone: "warn", text: "Your payment is still processing. Credits appear here as soon as it clears." };
      }
    } catch (e) {
      console.error("[billing] confirm", e);
      banner = { tone: "warn", text: "We couldn’t confirm that payment yet. If you were charged, credits will appear shortly." };
    }
  } else if (sp.canceled) {
    banner = { tone: "warn", text: "Checkout canceled. You weren’t charged." };
  }

  const limit = readLimit(sp.limit);
  const [{ data: balance }, { data: markupData }, ledger, { data: exempt }] = await Promise.all([
    supabase.rpc("claim_starter_credits"),
    supabase.rpc("credit_markup"),
    supabase.from("credit_ledger").select(LEDGER_COLUMNS).eq("user_id", user?.id ?? "").order("created_at", { ascending: false }).range(0, limit),
    supabase.rpc("is_billing_exempt"),
  ]);
  const markup = Number(markupData) || DEFAULT_MARKUP;
  const page = splitPage(ledger.data as LedgerRow[] | null, limit);
  const bal = typeof balance === "number" ? balance : 0;

  const examples = [
    { what: "An image", cents: priceFor(8, markup) },
    { what: "A 5-second video clip", cents: priceFor(35, markup) },
    { what: "A voice line", cents: priceFor(2, markup) },
    { what: "10 seconds of talking clip", cents: priceFor(80, markup) },
  ];

  return (
    <div className="st-stack cr-page">
      <div className="st-pagehead">
        <div>
          <h1>Credits</h1>
          <p className="st-sub">Credits pay for what you make in the AI Studio. You see the price before every generation, and anything that fails is refunded automatically.</p>
        </div>
      </div>

      {banner && <p className={`cr-banner ${banner.tone}`} role="status">{banner.text}</p>}
      {exempt === true && <p className="cr-banner ok" role="status">Billing is off for your account, so the AI Studio is free for you. Your credit balance stays as it is.</p>}
      {ledger.error && <p className="ai-off" role="alert">Credits aren’t set up in the database yet. Run the latest <code>supabase/schema.sql</code>, then reload.</p>}

      <div className="cr-top">
        <section className="panel cr-balance" aria-label="Balance">
          <span className="cr-label">Balance</span>
          <b className="cr-amount">{money(bal)}</b>
          <ul className="cr-examples">
            {examples.map((x) => <li key={x.what}><span>{x.what}</span><span>{money(x.cents)}</span></li>)}
          </ul>
          <Link className="btn ghost st-small" href="/studio/hub/characters">Go to your characters</Link>
        </section>

        <section className="panel cr-buy" aria-labelledby="cr-buy-title">
          <div className="cr-buy-head">
            <h2 id="cr-buy-title">Add credits</h2>
            {ready && isTestMode(env) && <span className="st-status requested">Test mode</span>}
          </div>
          {!ready && <p className="ai-off">Buying credits isn’t switched on yet. It will be soon; until then you can use your welcome credits.</p>}
          <BuyCredits ready={ready} />
          <p className="ai-hint">Paid securely through Stripe. Credits don’t expire and aren’t refundable as cash; see the <Link href="/legal/terms">terms</Link>.</p>
        </section>
      </div>

      <section className="st-stack" aria-labelledby="cr-hist">
        <h2 id="cr-hist" className="st-h2">History</h2>
        {page.items.length === 0 ? (
          <div className="hub-empty"><p>Nothing yet.</p></div>
        ) : (
          <div className="st-table">
            <div className="st-row st-row-head cr-row" aria-hidden="true"><span>Date</span><span>What</span><span className="cr-amt">Amount</span></div>
            {page.items.map((r) => (
              <div key={r.id} className="st-row cr-row">
                <span className="st-cell">{fmtDate(r.created_at)}</span>
                <span className="st-proj-text"><b>{LEDGER_LABEL[r.kind]}</b>{r.note && r.note !== LEDGER_LABEL[r.kind] && <small>{r.note}</small>}</span>
                <span className={`cr-amt ${r.amount_cents > 0 ? "plus" : ""}`}>{r.amount_cents > 0 ? "+" : ""}{money(r.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}
        {page.hasMore && <MoreLink href={moreHref("/studio/credits", {}, limit)} />}
      </section>
    </div>
  );
}
