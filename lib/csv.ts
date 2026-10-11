/** A small RFC 4180 CSV parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export const IMPORT_KINDS = ["Person", "Creature", "Robot", "Food", "Object", "Animal"] as const;
export const IMPORT_COLORS = ["Mint", "Peach", "Pink", "Sky", "Lilac", "Butter"] as const;
export const IMPORT_MOODS = ["Anxious", "Overachiever", "Dreamy", "Chatty", "Homebody", "Chill"] as const;
export const IMPORT_MAX = 200;
export const IMPORT_TEMPLATE = "name,kind,color,personality,description\nMango,Food,Peach,Dreamy,A sleepy cupcake who narrates life\nCaptain Crumb,Food,Butter,Chatty,A grumpy pirate cookie\n";

export type ImportRow = { line: number; name: string; kind: string; color: string; personality: string; description: string | null; errors: string[] };

const pick = (value: string, allowed: readonly string[], fallback: string) => {
  const v = value.trim().toLowerCase();
  if (!v) return { value: fallback, ok: true };
  const hit = allowed.find((a) => a.toLowerCase() === v);
  return hit ? { value: hit, ok: true } : { value, ok: false };
};

/** Turns CSV text into characters to create. Headers are matched loosely; only `name` is required. */
export function readCharacterCsv(text: string): { rows: ImportRow[]; error?: string } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], error: "The file is empty." };
  const header = all[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = col("name", "character", "character name");
  if (iName < 0) return { rows: [], error: "Add a header row with at least a “name” column." };
  const iKind = col("kind", "type");
  const iColor = col("color", "colour");
  const iMood = col("personality", "mood");
  const iDesc = col("description", "bio", "about");
  const body = all.slice(1);
  if (body.length > IMPORT_MAX) return { rows: [], error: `That’s ${body.length} rows. Import up to ${IMPORT_MAX} at a time.` };
  const seen = new Set<string>();
  const rows = body.map((r, i) => {
    const get = (idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
    const errors: string[] = [];
    const name = get(iName).slice(0, 60);
    if (!name) errors.push("Missing name");
    if (name && seen.has(name.toLowerCase())) errors.push("Duplicate name in this file");
    seen.add(name.toLowerCase());
    const kind = pick(get(iKind), IMPORT_KINDS, "Person");
    if (!kind.ok) errors.push(`Kind must be one of ${IMPORT_KINDS.join(", ")}`);
    const color = pick(get(iColor), IMPORT_COLORS, "Mint");
    if (!color.ok) errors.push(`Color must be one of ${IMPORT_COLORS.join(", ")}`);
    const mood = pick(get(iMood), IMPORT_MOODS, "Dreamy");
    if (!mood.ok) errors.push(`Personality must be one of ${IMPORT_MOODS.join(", ")}`);
    const desc = get(iDesc);
    if (desc.length > 200) errors.push("Description is over 200 characters");
    return { line: i + 2, name, kind: kind.value, color: color.value, personality: mood.value, description: desc || null, errors };
  });
  return { rows };
}
