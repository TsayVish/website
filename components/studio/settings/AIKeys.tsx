"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "anthropic" | "openai";
export type SavedKey = { provider: Provider; hint: string | null; model: string | null; is_default: boolean; verified_at: string | null };
export type RunRow = { id: string; task: string; provider: Provider; model: string; own_key: boolean; price_cents: number; created_at: string };

const INFO: Record<Provider, { name: string; console: string; consoleLabel: string; placeholder: string; mark: string }> = {
  anthropic: { name: "Claude", console: "https://console.anthropic.com/settings/keys", consoleLabel: "Anthropic Console", placeholder: "sk-ant-…", mark: "C" },
  openai: { name: "OpenAI", console: "https://platform.openai.com/api-keys", consoleLabel: "OpenAI Platform", placeholder: "sk-…", mark: "O" },
};
const TASK_LABEL: Record<string, string> = { caption: "Captions", ideas: "Ideas", plan: "Posting plan", script: "Script", bible: "Character bible", rewrite: "Rewrite" };

/** Settings → AI: add, choose and remove your own API keys, and see recent AI usage. */
export function AIKeys({ keys, runs, fallback }: { keys: SavedKey[]; runs: RunRow[]; fallback: string | null }) {
  const active = keys.find((k) => k.is_default) ?? keys[0];
  return (
    <div className="st-stack">
      <div className="panel ak-now">
        <b className="st-panel-title">What the AI tools use right now</b>
        <p>
          {active ? <>Your <b>{INFO[active.provider].name}</b> key ({active.model}). Usage is billed by {INFO[active.provider].name} to your API account, not tsayvish.</>
            : fallback ? <>tsayvish’s Claude key. {fallback}. Add your own key to use your API account instead.</>
              : <>Nothing yet. Add a Claude or OpenAI key below to turn on the writing tools.</>}
        </p>
        <p className="ai-hint">
          A Claude Pro/Max or ChatGPT Plus subscription can’t be used by other apps. Those plans only work in Claude and ChatGPT themselves.
          What works here is an <b>API key</b> from the Anthropic Console or OpenAI Platform, which is billed separately, per use.
        </p>
      </div>
      <div className="ak-grid">
        {(["anthropic", "openai"] as Provider[]).map((p) => <KeyCard key={p} provider={p} saved={keys.find((k) => k.provider === p)} isActive={active?.provider === p} />)}
      </div>
      <section className="st-stack">
        <h2 className="org-h2">Recent AI use</h2>
        {runs.length === 0 ? <p className="ai-hint">Nothing yet.</p> : (
          <div className="st-table">
            {runs.map((r) => (
              <div key={r.id} className="st-row ak-run">
                <span>{TASK_LABEL[r.task] ?? r.task}</span>
                <span className="st-cell">{r.model}</span>
                <span className="st-cell">{r.own_key ? "Your key" : r.price_cents ? `$${(r.price_cents / 100).toFixed(2)} credits` : "Free"}</span>
                <span className="st-cell st-date">{new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KeyCard({ provider, saved, isActive }: { provider: Provider; saved?: SavedKey; isActive: boolean }) {
  const router = useRouter();
  const info = INFO[provider];
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [models, setModels] = useState<string[] | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setOk("");
    try {
      const res = await fetch("/api/ai/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn’t save the key.");
      setModels(body.models);
      setKey(""); setEditing(false); setOk(`Key works. Using ${body.model}.`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  }
  async function loadModels() {
    if (models) return;
    const res = await fetch(`/api/ai/keys?provider=${provider}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setModels(body.models); else setError(body.error || "Couldn’t load models.");
  }
  async function rpc(fn: string, args: Record<string, unknown>, msg: string) {
    setBusy(true); setError(""); setOk("");
    const { error: err } = await createClient().rpc(fn, args);
    setBusy(false);
    if (err) setError(err.message); else { setOk(msg); router.refresh(); }
  }

  return (
    <div className={`panel ak-card${isActive ? " on" : ""}`}>
      <div className="ak-head">
        <span className={`ak-mark ak-${provider}`} aria-hidden="true">{info.mark}</span>
        <div><b>{info.name}</b><small>{saved ? (isActive ? "In use" : "Saved") : "Not added"}</small></div>
      </div>
      {saved && !editing && (
        <>
          <dl className="ak-dl">
            <div><dt>Key</dt><dd><code>{saved.hint}</code></dd></div>
            <div><dt>Model</dt><dd>
              <select className="st-input st-small" value={saved.model ?? ""} onFocus={loadModels} onMouseDown={loadModels} disabled={busy}
                onChange={(e) => rpc("ai_set_key_options", { p_provider: provider, p_model: e.target.value, p_default: false }, "Model saved.")}>
                {[saved.model, ...(models ?? []).filter((m) => m !== saved.model)].filter(Boolean).map((m) => <option key={m!} value={m!}>{m}</option>)}
              </select>
            </dd></div>
          </dl>
          <div className="ak-actions">
            {!isActive && <button type="button" className="btn st-small" disabled={busy} onClick={() => rpc("ai_set_key_options", { p_provider: provider, p_model: "", p_default: true }, `Using ${info.name}.`)}>Use this one</button>}
            <button type="button" className="btn ghost st-small" onClick={() => setEditing(true)}>Replace key</button>
            <button type="button" className="btn ghost st-small adm-danger" disabled={busy}
              onClick={() => { if (window.confirm(`Remove your ${info.name} key?`)) rpc("ai_delete_key", { p_provider: provider }, "Key removed."); }}>Remove</button>
          </div>
        </>
      )}
      {editing && (
        <form className="ak-form" onSubmit={save}>
          <label className="so-field"><span className="lbl">API key</span>
            <input className="st-input" type="password" autoComplete="off" spellCheck={false} placeholder={info.placeholder} value={key} onChange={(e) => setKey(e.target.value)} /></label>
          <p className="ai-hint">Create one in the <a href={info.console} target="_blank" rel="noopener noreferrer">{info.consoleLabel}</a>. It’s checked with {info.name}, then stored encrypted; nobody at tsayvish can read it back.</p>
          <div className="ak-actions">
            <button className="btn st-small" type="submit" disabled={busy || key.trim().length < 20}>{busy ? "Checking…" : "Save key"}</button>
            {saved && <button type="button" className="btn ghost st-small" onClick={() => { setEditing(false); setKey(""); }}>Cancel</button>}
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {ok && <p className="form-ok" role="status">{ok}</p>}
    </div>
  );
}
