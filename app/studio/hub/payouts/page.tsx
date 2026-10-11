import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Payouts</h1><p className="st-sub">Money you’ve earned on tsayvish.</p></div></div>
      <div className="hub-banner">
        <div>
          <b>Payouts aren’t switched on yet</b>
          <p>Earnings start once a storefront or licensing deal is live. To get set up, request the Payments service on one of your originals and our team will connect a payout account with you.</p>
        </div>
        <Link className="btn" href="/studio/projects">Go to my projects</Link>
      </div>
      <section className="panel hub-balance">
        <div>
          <span className="st-help">Available to withdraw</span>
          <b className="hub-balance-amount">$0.00</b>
          <span className="st-help">You haven’t earned anything on tsayvish yet.</span>
        </div>
        <button type="button" className="btn ghost" disabled title="Available once Payments is set up">Add payout method</button>
      </section>
      <section className="panel">
        <h2>How payouts will work</h2>
        <ul className="hub-list">
          <li>Sales from your storefront and licensing payments collect here.</li>
          <li>Royalty splits you set on a project’s Payments tab are applied automatically.</li>
          <li>Bank details are entered with our payments partner, never stored on tsayvish.</li>
        </ul>
      </section>
    </div>
  );
}
