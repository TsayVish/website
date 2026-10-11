"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MEDIA, TERRITORY_OPTIONS, agreementClauses, termLabel, type AgreementParties, type AgreementTerms } from "@/lib/agreement";
import { createClient } from "@/lib/supabase/client";

export type AgreementState = {
  version: number;
  status: "proposed" | "signed";
  terms: AgreementTerms;
  seller_accepted_at: string | null;
  seller_signature: string | null;
  buyer_accepted_at: string | null;
  buyer_signature: string | null;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Write, review and accept the license agreement for a deal. */
export function AgreementPanel({
  offerId, role, agreement, defaults, parties, myName,
}: {
  offerId: string; role: "seller" | "buyer"; agreement: AgreementState | null; defaults: AgreementTerms; parties: AgreementParties; myName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const isSeller = role === "seller";

  if (!agreement && !isSeller) {
    return (
      <section className="panel ag" id="agreement">
        <b className="st-panel-title">License agreement</b>
        <p className="st-muted">{parties.licensor} hasn’t sent the agreement yet. You’ll get a notification when it’s ready to review.</p>
      </section>
    );
  }
  if (!agreement || editing) {
    return (
      <section className="panel ag" id="agreement">
        <b className="st-panel-title">{agreement ? "Revise the agreement" : "Write the license agreement"}</b>
        <p className="st-muted">Set the terms, then send it to {parties.licensee} to accept. {agreement ? "Sending a revision clears both acceptances." : ""}</p>
        <TermsEditor offerId={offerId} initial={agreement?.terms ?? defaults} kind={parties.kind}
          onDone={() => { setEditing(false); router.refresh(); }} onCancel={agreement ? () => setEditing(false) : undefined} />
      </section>
    );
  }

  const clauses = agreementClauses(agreement.terms, parties);
  const mineAccepted = isSeller ? agreement.seller_accepted_at : agreement.buyer_accepted_at;
  return (
    <section className={`panel ag ${agreement.status === "signed" ? "is-signed" : ""}`} id="agreement">
      <div className="ag-head">
        <div>
          <b className="st-panel-title">License agreement</b>
          <p className="st-muted">Version {agreement.version} · {agreement.status === "signed" ? "Signed by both" : "Waiting for signatures"}</p>
        </div>
        <div className="st-actions">
          <Link className="btn ghost st-small" href={`/studio/deals/${offerId}/agreement`}>{agreement.status === "signed" ? "View and download" : "Full view"}</Link>
          {isSeller && agreement.status !== "signed" && <button type="button" className="btn ghost st-small" onClick={() => setEditing(true)}>Revise</button>}
        </div>
      </div>
      <dl className="ag-summary">
        <div><dt>Scope</dt><dd>{parties.kind === "character" ? (agreement.terms.media.join(", ") || "As described") : parties.property}</dd></div>
        <div><dt>Territory</dt><dd>{agreement.terms.territory}</dd></div>
        <div><dt>Term</dt><dd>{termLabel(agreement.terms.term_months)}</dd></div>
        <div><dt>Exclusive</dt><dd>{agreement.terms.exclusive ? "Yes" : "No"}</dd></div>
        <div><dt>Fee</dt><dd>{agreement.terms.fee.toLocaleString("en-US", { style: "currency", currency: "USD" })}</dd></div>
      </dl>
      <details className="ag-clauses">
        <summary>Read all {clauses.length} sections</summary>
        {clauses.map((c) => <div key={c.heading}><b>{c.heading}</b><p>{c.text}</p></div>)}
      </details>
      <ul className="ag-sigs">
        <li className={agreement.seller_accepted_at ? "done" : ""}><span>{parties.licensor} (licensor)</span><b>{agreement.seller_accepted_at ? `Signed as “${agreement.seller_signature}” · ${when(agreement.seller_accepted_at)}` : "Not signed yet"}</b></li>
        <li className={agreement.buyer_accepted_at ? "done" : ""}><span>{parties.licensee} (licensee)</span><b>{agreement.buyer_accepted_at ? `Signed as “${agreement.buyer_signature}” · ${when(agreement.buyer_accepted_at)}` : "Not signed yet"}</b></li>
      </ul>
      {!mineAccepted && agreement.status !== "signed" && <SignForm offerId={offerId} version={agreement.version} myName={myName} onDone={() => router.refresh()} />}
      <p className="st-help">This is a template agreement. For anything significant, have a lawyer review it before signing.</p>
    </section>
  );
}

function SignForm({ offerId, version, myName, onDone }: { offerId: string; version: number; myName: string; onDone: () => void }) {
  const [name, setName] = useState(myName);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agree) return setError("Tick the box to confirm.");
    setBusy(true);
    setError("");
    const { error: err } = await createClient().rpc("accept_agreement", { p_offer: offerId, p_signature: name, p_version: version });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  }
  return (
    <form className="ag-sign" onSubmit={submit}>
      <label className="ex-confirm">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I’ve read version {version} of this agreement and agree to it. Typing my name below is my signature.</span>
      </label>
      <div className="tm-invite-row">
        <label htmlFor="ag-name" className="visually-hidden">Your full name</label>
        <input id="ag-name" className="st-input ag-sig-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
        <button className="btn" type="submit" disabled={busy}>{busy ? "Signing…" : "Sign agreement"}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function TermsEditor({ offerId, initial, kind, onDone, onCancel }: { offerId: string; initial: AgreementTerms; kind: "character" | "service"; onDone: () => void; onCancel?: () => void }) {
  const [t, setT] = useState<AgreementTerms>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof AgreementTerms>(k: K, v: AgreementTerms[K]) => setT((x) => ({ ...x, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "character" && !t.media.length) return setError("Pick at least one kind of use.");
    if (!(t.fee >= 0)) return setError("Enter the fee.");
    setBusy(true);
    setError("");
    const { error: err } = await createClient().rpc("propose_agreement", { p_offer: offerId, p_terms: t });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  }
  return (
    <form className="ag-form" onSubmit={submit}>
      {kind === "character" && (
        <div className="field">
          <span className="lbl" id="ag-media">Licensed uses</span>
          <div className="chips" role="group" aria-labelledby="ag-media">
            {MEDIA.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={t.media.includes(m)}
                onClick={() => set("media", t.media.includes(m) ? t.media.filter((x) => x !== m) : [...t.media, m])}>{m}</button>
            ))}
          </div>
        </div>
      )}
      <div className="st-fields">
        <div className="field">
          <label htmlFor="ag-terr">Territory</label>
          <select id="ag-terr" className="st-input" value={t.territory} onChange={(e) => set("territory", e.target.value)}>
            {TERRITORY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ag-term">Term</label>
          <select id="ag-term" className="st-input" value={t.term_months} onChange={(e) => set("term_months", Number(e.target.value))}>
            {[3, 6, 12, 24, 36, 60, 0].map((m) => <option key={m} value={m}>{termLabel(m)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ag-fee">Fee (USD)</label>
          <input id="ag-fee" className="st-input" inputMode="decimal" value={String(t.fee)} onChange={(e) => set("fee", Number(e.target.value.replace(/[$,\s]/g, "")))} />
        </div>
        <div className="field">
          <span className="lbl" id="ag-ex">Exclusive?</span>
          <div className="chips" role="group" aria-labelledby="ag-ex">
            <button type="button" className="chip" aria-pressed={!t.exclusive} onClick={() => set("exclusive", false)}>Non-exclusive</button>
            <button type="button" className="chip" aria-pressed={t.exclusive} onClick={() => set("exclusive", true)}>Exclusive</button>
          </div>
        </div>
        <div className="field st-wide">
          <label htmlFor="ag-pay">Payment terms</label>
          <input id="ag-pay" className="st-input" maxLength={500} value={t.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
        </div>
        <div className="field st-wide">
          <label htmlFor="ag-del">Deliverables <span className="opt-hint">(optional)</span></label>
          <textarea id="ag-del" className="st-input" rows={2} maxLength={2000} value={t.deliverables} onChange={(e) => set("deliverables", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl" id="ag-ap">Approvals</span>
          <div className="chips" role="group" aria-labelledby="ag-ap">
            <button type="button" className="chip" aria-pressed={t.approvals} onClick={() => set("approvals", true)}>I approve each use</button>
            <button type="button" className="chip" aria-pressed={!t.approvals} onClick={() => set("approvals", false)}>No approval needed</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ag-attr">Credit line <span className="opt-hint">(optional)</span></label>
          <input id="ag-attr" className="st-input" maxLength={300} value={t.attribution} placeholder="Mango © Snack Studio" onChange={(e) => set("attribution", e.target.value)} />
        </div>
        <div className="field st-wide">
          <label htmlFor="ag-other">Additional terms <span className="opt-hint">(optional)</span></label>
          <textarea id="ag-other" className="st-input" rows={3} maxLength={4000} value={t.other} onChange={(e) => set("other", e.target.value)} />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="st-actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send for signature"}</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
