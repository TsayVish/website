/*
 * Credits for the AI Studio. Balances are US cents; $1 of credits = 100.
 * Self-contained so the browser, the server and the unit tests can all use it.
 */

export type CreditPack = { id: string; cents: number; label: string; note?: string };

/** What people can buy. Change amounts here; Stripe uses whatever is listed. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-5", cents: 500, label: "$5" , note: "About 40 images" },
  { id: "pack-10", cents: 1000, label: "$10", note: "About 19 five-second clips" },
  { id: "pack-25", cents: 2500, label: "$25", note: "Best for episodes" },
  { id: "pack-50", cents: 5000, label: "$50", note: "For teams" },
];

export const packById = (id: unknown) => CREDIT_PACKS.find((p) => p.id === id);

/** Matches credit_markup() in the database; the database is what actually charges. */
export const DEFAULT_MARKUP = 1.5;

/** What a job costs the person, in cents. Same rounding as credit_price() in the database. */
export function priceFor(costCents: number, markup = DEFAULT_MARKUP) {
  return Math.max(1, Math.ceil(Math.max(0, costCents) * markup - 1e-9));
}

export const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export type LedgerKind = "starter" | "purchase" | "grant" | "charge" | "refund" | "adjust";
export type LedgerRow = {
  id: string;
  user_id: string;
  kind: LedgerKind;
  amount_cents: number;
  generation_id: string | null;
  stripe_session: string | null;
  note: string | null;
  created_at: string;
};
export const LEDGER_COLUMNS = "id, user_id, kind, amount_cents, generation_id, stripe_session, note, created_at";

export const LEDGER_LABEL: Record<LedgerKind, string> = {
  starter: "Welcome credits",
  purchase: "Bought credits",
  grant: "Added by tsayvish",
  charge: "AI Studio",
  refund: "Refund",
  adjust: "Adjustment",
};
