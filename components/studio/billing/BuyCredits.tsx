"use client";

import { useState } from "react";
import { CREDIT_PACKS } from "@/lib/billing";

/** Credit packs; each opens Stripe Checkout. */
export function BuyCredits({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function buy(pack: string) {
    setBusy(pack);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.url) throw new Error(out.error || "Couldn’t open checkout. Try again.");
      window.location.assign(out.url);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  }

  return (
    <div className="cr-packs-wrap">
      <ul className="cr-packs">
        {CREDIT_PACKS.map((p) => (
          <li key={p.id} className="cr-pack">
            <b>{p.label}</b>
            {p.note && <span>{p.note}</span>}
            <button type="button" className="btn st-small" onClick={() => buy(p.id)} disabled={!ready || !!busy}>
              {busy === p.id ? "Opening…" : `Buy ${p.label}`}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
