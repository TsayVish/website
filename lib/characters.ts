export const ASSET_KINDS = [
  { key: "reference", label: "Reference" },
  { key: "turnaround", label: "Turnaround" },
  { key: "expression", label: "Expression" },
  { key: "logo", label: "Logo" },
  { key: "other", label: "Other" },
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number]["key"];

export type CharacterAsset = { id: string; project_id: string; added_by: string; kind: AssetKind; label: string | null; url: string; created_at: string };
export const ASSET_COLUMNS = "id, project_id, added_by, kind, label, url, created_at";

/** Brand rules for a character. Stored in projects.style_guide. */
export type StyleGuide = {
  palette?: string[];      // hex colors
  voice?: string;          // how they talk
  catchphrases?: string[];
  dos?: string;
  donts?: string;
  usage?: string;          // licensing / usage notes
};

export const HEX = /^#[0-9a-f]{6}$/i;

export function readStyleGuide(raw: unknown): StyleGuide {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    palette: Array.isArray(g.palette) ? g.palette.filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, 8) : [],
    voice: str(g.voice),
    catchphrases: Array.isArray(g.catchphrases) ? g.catchphrases.filter((c): c is string => typeof c === "string").slice(0, 12) : [],
    dos: str(g.dos),
    donts: str(g.donts),
    usage: str(g.usage),
  };
}

export const isStyleGuideEmpty = (g: StyleGuide) =>
  !g.palette?.length && !g.voice && !g.catchphrases?.length && !g.dos && !g.donts && !g.usage;

export type CharacterVersion = { id: string; snapshot: Record<string, unknown>; changed_by: string | null; created_at: string };

/** What changed between a saved version and the next state, in plain words. */
export function describeChange(before: Record<string, unknown>, after: Record<string, unknown>) {
  const labels: Record<string, string> = {
    name: "name", kind: "kind", color: "color", personality: "personality",
    description: "description", image_url: "picture", style_guide: "style guide",
  };
  const changed = Object.keys(labels).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
  return changed.length ? `Changed ${changed.map((k) => labels[k]).join(", ")}` : "No visible changes";
}
