"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { IMPORT_MAX, IMPORT_TEMPLATE, readCharacterCsv, type ImportRow } from "@/lib/csv";
import { createClient } from "@/lib/supabase/client";

/** Create many characters at once from a spreadsheet (CSV). */
export function CsvImport({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [problem, setProblem] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(0);

  function read(src: string) {
    setText(src);
    setDone(0);
    if (!src.trim()) return setRows(null), setProblem("");
    const { rows: r, error } = readCharacterCsv(src);
    setProblem(error ?? "");
    setRows(error ? null : r);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1024 * 1024) return setProblem("That file is over 1 MB.");
    read(await f.text());
  }

  const good = rows?.filter((r) => !r.errors.length) ?? [];
  const bad = rows?.filter((r) => r.errors.length) ?? [];

  async function importAll() {
    if (!good.length) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let created = 0;
    try {
      for (let i = 0; i < good.length; i += 50) {
        setBusy(`Creating ${Math.min(i + 50, good.length)} of ${good.length}…`);
        const chunk = good.slice(i, i + 50).map((r) => ({
          type: "original", owner_id: user?.id, name: r.name, kind: r.kind, color: r.color,
          personality: r.personality, description: r.description, workspace_id: workspace || null,
        }));
        const { error } = await supabase.from("projects").insert(chunk);
        if (error) throw new Error(error.message);
        created += chunk.length;
      }
      setDone(created);
      setRows(null);
      setText("");
      router.refresh();
    } catch (err) {
      setProblem(`Stopped after ${created}: ${err instanceof Error ? err.message : String(err)}`);
    }
    setBusy("");
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`;

  return (
    <div className="st-stack">
      {done > 0 && (
        <p className="form-ok" role="status">
          Created {done} character{done === 1 ? "" : "s"}. <Link href="/studio/hub/characters">See them in Characters</Link>
        </p>
      )}
      <div className="panel ch-import">
        <ol className="ch-import-steps">
          <li><b>Get the template.</b> Columns: name (required), kind, color, personality, description. <a href={templateHref} download="tsayvish-characters.csv">Download CSV template</a></li>
          <li><b>Fill it in</b> in Excel, Numbers or Google Sheets, then export as CSV. Up to {IMPORT_MAX} rows.</li>
          <li><b>Upload or paste it</b> below, check the preview, and import.</li>
        </ol>
        <div className="ch-import-input">
          <label className="btn ghost st-small" htmlFor="csv-file">Choose CSV file</label>
          <input id="csv-file" className="visually-hidden" type="file" accept=".csv,text/csv" onChange={onFile} />
          <span className="st-muted">or paste below</span>
        </div>
        <label htmlFor="csv-text" className="visually-hidden">CSV</label>
        <textarea id="csv-text" className="st-input ch-csv" rows={6} value={text} placeholder={IMPORT_TEMPLATE} onChange={(e) => read(e.target.value)} />
        {workspaces.length > 0 && (
          <div className="field">
            <label htmlFor="csv-ws">Add to</label>
            <select id="csv-ws" className="st-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
              <option value="">Just me</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        {problem && <p className="form-error" role="alert">{problem}</p>}
      </div>

      {rows && (
        <section className="st-stack">
          <div className="st-pagehead">
            <div><h2>Preview</h2><p className="st-sub">{good.length} ready{bad.length ? ` · ${bad.length} need fixing (they’ll be skipped)` : ""}</p></div>
            <div className="st-actions">
              <button className="btn" type="button" disabled={!good.length || !!busy} onClick={importAll}>
                {busy || `Import ${good.length} character${good.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          <div className="st-table">
            <div className="st-row st-row-head ch-imp-row" aria-hidden="true"><span>Row</span><span>Name</span><span>Kind · color · personality</span><span>Status</span></div>
            {rows.map((r) => (
              <div key={r.line} className="st-row ch-imp-row">
                <span className="st-cell">{r.line}</span>
                <span className="st-proj-text"><b>{r.name || "—"}</b>{r.description && <small>{r.description}</small>}</span>
                <span className="st-cell">{r.kind} · {r.color} · {r.personality}</span>
                <span>{r.errors.length ? <small className="form-error">{r.errors.join(". ")}</small> : <span className="st-status active">Ready</span>}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
