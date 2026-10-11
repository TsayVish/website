/** Extra facts kept (in projects.details) for a character someone brought with them. */
export const AUDIENCE_SIZES = ["Just starting", "Under 10k", "10k–100k", "100k–1M", "Over 1M"] as const;
export const IP_STATUSES = ["Trademark registered", "Trademark pending", "Copyright only", "Not protected yet", "Not sure"] as const;
export const RIGHTS = ["I own it outright", "Co-owned with others", "Licensed to me"] as const;

export type ExistingDetails = {
  origin: "existing";
  links?: string[];
  audience?: string;
  ip_status?: string;
  rights?: string;
  since?: string; // year first published
};

export const isExisting = (details: unknown): details is ExistingDetails =>
  Boolean(details && typeof details === "object" && (details as { origin?: string }).origin === "existing");

/** Keeps only http(s) links, at most five. */
export function cleanLinks(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`))
    .filter((s) => {
      try {
        const u = new URL(s);
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
      } catch {
        return false;
      }
    })
    .slice(0, 5);
}

/** "Dreamy · person", or "Existing character · since 2021" for uploaded ones. */
export function characterSubtitle(p: { personality: string | null; kind: string | null; details: unknown }, kindLabel: (k: string | null) => string) {
  if (isExisting(p.details)) return ["Existing character", p.details.since ? `since ${p.details.since}` : ""].filter(Boolean).join(" · ");
  return [p.personality, kindLabel(p.kind).toLowerCase()].filter(Boolean).join(" · ");
}
