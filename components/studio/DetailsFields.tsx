"use client";

import type { Field } from "@/lib/services";
import type { Details } from "@/lib/types";

/** Renders a list of fields (text, select, multi-choice chips…) for a tab's form. */
export function DetailsFields({
  fields, values, onChange, idPrefix,
}: {
  fields: Field[];
  values: Details;
  onChange: (key: string, value: string | string[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="st-fields">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const value = values[f.key];
        const text = typeof value === "string" ? value : "";
        const list = Array.isArray(value) ? value : [];
        return (
          <div className={f.wide || f.type === "textarea" ? "field st-wide" : "field"} key={f.key}>
            {f.type === "multi" ? (
              <span className="lbl" id={`${id}-lbl`}>{f.label}</span>
            ) : (
              <label htmlFor={id}>{f.label}</label>
            )}
            {f.type === "textarea" ? (
              <textarea className="st-input" id={id} rows={4} maxLength={2000} placeholder={f.placeholder} value={text} onChange={(e) => onChange(f.key, e.target.value)} />
            ) : f.type === "select" ? (
              <select className="st-input" id={id} value={text} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "multi" ? (
              <div className="chips" role="group" aria-labelledby={`${id}-lbl`}>
                {f.options?.map((o) => {
                  const on = list.includes(o);
                  return (
                    <button
                      key={o} type="button" className="chip" aria-pressed={on}
                      onClick={() => onChange(f.key, on ? list.filter((x) => x !== o) : [...list, o])}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                className="st-input" id={id} value={text} placeholder={f.placeholder}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                min={f.type === "number" ? 0 : undefined} maxLength={f.type === "text" || f.type === "url" ? 300 : undefined}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
            {f.help && <small className="st-help">{f.help}</small>}
          </div>
        );
      })}
    </div>
  );
}

/** Drops empty answers so saved JSON stays tidy. */
export function cleanDetails(values: Details): Details {
  const out: Details = {};
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v) ? v.length : String(v).trim()) out[k] = Array.isArray(v) ? v : String(v).trim();
  }
  return out;
}
