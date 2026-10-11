import type { BillingEnv, PaidCredits } from "./billing-stripe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Records a paid purchase in the ledger (once per Stripe session). Returns true if credits were added now. */
export async function recordPurchase(db: Db, env: BillingEnv, paid: PaidCredits) {
  if (!env.dbSecret) throw new Error("BILLING_DB_SECRET isn’t set.");
  const { data, error } = await db.rpc("record_credit_purchase", {
    p_secret: env.dbSecret, p_session: paid.sessionId, p_user: paid.userId, p_cents: paid.cents, p_note: paid.note,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
