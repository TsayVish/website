"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { IconTag } from "@/components/studio/icons";
import { fmtDate, type PromoCode } from "@/lib/hub";
import { createClient } from "@/lib/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

/** Create, pause and delete discount codes. */
export function PromoManager({ initial, listings }: { initial: PromoCode[]; listings: { id: string; title: string }[] }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initial);
  const [open, setOpen] = useState(initial.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listingName = new Map(listings.map((l) => [l.id, l.title]));

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const code = String(d.get("code") ?? "").trim().toUpperCase();
    const percent = Number(d.get("percent"));
    const maxUses = String(d.get("max") ?? "").trim();
    const expires = String(d.get("expires") ?? "");
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return setError("Codes are 3–24 letters, numbers, dashes or underscores.");
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) return setError("Discount must be a whole number from 1 to 90.");
    if (maxUses && !(Number.isInteger(Number(maxUses)) && Number(maxUses) >= 1)) return setError("Max uses must be a whole number, or leave it blank.");
    if (expires && expires < today()) return setError("The end date is in the past.");
    setError("");
    setBusy(true);
    const { data, error: err } = await createClient()
      .from("promo_codes")
      .insert({
        code,
        percent_off: percent,
        listing_id: String(d.get("listing") ?? "") || null,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_on: expires || null,
      })
      .select("id, code, percent_off, listing_id, max_uses, expires_on, active, created_at")
      .single();
    setBusy(false);
    if (err || !data) return setError(err?.message.includes("duplicate") ? `You already have a code called ${code}.` : `Couldn’t save: ${err?.message}`);
    setCodes((c) => [data as PromoCode, ...c]);
    form.reset();
    setOpen(false);
    router.refresh();
  }

  async function toggle(p: PromoCode) {
    setCodes((c) => c.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    const { error: err } = await createClient().from("promo_codes").update({ active: !p.active }).eq("id", p.id);
    if (err) {
      setError(err.message);
      setCodes((c) => c.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)));
    }
  }

  async function remove(p: PromoCode) {
    const before = codes;
    setCodes((c) => c.filter((x) => x.id !== p.id));
    const { error: err } = await createClient().from("promo_codes").delete().eq("id", p.id);
    if (err) {
      setError(err.message);
      setCodes(before);
    }
  }

  const status = (p: PromoCode) =>
    !p.active ? { cls: "off", text: "Paused" } : p.expires_on && p.expires_on < today() ? { cls: "off", text: "Ended" } : { cls: "active", text: "Active" };

  return (
    <div className="st-stack">
      {open ? (
        <form className="panel hub-promo-form" onSubmit={create} noValidate>
          <div className="hub-panel-head"><b className="st-panel-title">New discount code</b></div>
          <div className="hub-form-grid">
            <div className="field">
              <label htmlFor="pr-code">Code</label>
              <input className="st-input hub-code-input" id="pr-code" name="code" maxLength={24} placeholder="LAUNCH20" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="pr-pct">Percent off</label>
              <input className="st-input" id="pr-pct" name="percent" type="number" min={1} max={90} defaultValue={15} required />
            </div>
            <div className="field">
              <label htmlFor="pr-listing">Applies to</label>
              <select className="st-input" id="pr-listing" name="listing" defaultValue="">
                <option value="">All my listings</option>
                {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pr-max">Max uses <span className="opt-hint">(optional)</span></label>
              <input className="st-input" id="pr-max" name="max" type="number" min={1} placeholder="Unlimited" />
            </div>
            <div className="field">
              <label htmlFor="pr-exp">Ends on <span className="opt-hint">(optional)</span></label>
              <input className="st-input" id="pr-exp" name="expires" type="date" min={today()} />
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="st-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Create code"}</button>
            {codes.length > 0 && <button className="btn ghost" type="button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>}
          </div>
        </form>
      ) : (
        <div className="st-actions"><button className="btn" type="button" onClick={() => setOpen(true)}>New discount code</button></div>
      )}

      {!open && error && <p className="form-error" role="alert">{error}</p>}

      {codes.length === 0 ? (
        <EmptyState icon={<IconTag />} title="No promotions yet">
          Create a code to offer a discount on everything you list, or on a single character or service.
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head hub-promo-row" aria-hidden="true">
            <span>Code</span><span>Discount</span><span>Applies to</span><span>Ends</span><span>Status</span><span />
          </div>
          {codes.map((p) => {
            const s = status(p);
            return (
              <div key={p.id} className="st-row hub-promo-row">
                <span className="st-proj-text"><b className="hub-code">{p.code}</b><small>{p.max_uses ? `Up to ${p.max_uses} uses` : "Unlimited uses"}</small></span>
                <span className="st-cell">{p.percent_off}% off</span>
                <span className="st-cell">{p.listing_id ? listingName.get(p.listing_id) ?? "A listing" : "All listings"}</span>
                <span className="st-cell">{p.expires_on ? fmtDate(`${p.expires_on}T12:00:00`) : "No end date"}</span>
                <span><span className={`st-status ${s.cls}`}>{s.text}</span></span>
                <span className="hub-row-actions">
                  <button type="button" className="btn ghost st-small" onClick={() => toggle(p)}>{p.active ? "Pause" : "Resume"}</button>
                  <button type="button" className="btn ghost st-small hub-danger-text" onClick={() => remove(p)} aria-label={`Delete ${p.code}`}>Delete</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
