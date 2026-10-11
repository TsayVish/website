/** License agreement terms, and the plain-English clauses generated from them. A template, not legal advice. */
export const MEDIA = ["Merchandise and physical products", "Digital and social media", "Advertising and marketing", "Film, TV and streaming", "Publishing and print", "Games and interactive", "Live events"] as const;
/** "worldwide" or "in the United States" etc. */
export function where(territory: string): string {
  const t = territory.trim();
  if (/^worldwide$/i.test(t)) return "worldwide";
  return /^(united|european)\b/i.test(t) ? `in the ${t}` : `in ${t}`;
}

export const TERRITORY_OPTIONS = ["Worldwide", "United States", "North America", "European Union", "United Kingdom", "Asia-Pacific"] as const;

export type AgreementTerms = {
  media: string[];
  territory: string;
  term_months: number;          // 0 = perpetual
  exclusive: boolean;
  fee: number;                  // USD
  payment_terms: string;        // e.g. "Due within 14 days of signing"
  deliverables: string;
  approvals: boolean;           // licensor approves uses before release
  attribution: string;          // credit line, if any
  other: string;
};

export type AgreementParties = { licensor: string; licensee: string; property: string; kind: "character" | "service"; date: string };

export const AGREEMENT_STATUS_LABEL = { proposed: "Waiting for signatures", signed: "Signed by both" } as const;

export function defaultTerms(fee: number, kind: "character" | "service"): AgreementTerms {
  return {
    media: kind === "character" ? ["Digital and social media"] : [],
    territory: "Worldwide",
    term_months: 12,
    exclusive: false,
    fee,
    payment_terms: "Paid in full within 14 days of signing.",
    deliverables: kind === "character" ? "Character artwork and style guide files." : "",
    approvals: kind === "character",
    attribution: "",
    other: "",
  };
}

/** Accept only well-formed terms (from the database or a form). */
export function readTerms(raw: unknown, fallbackFee = 0): AgreementTerms {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
  const months = Number(t.term_months);
  const fee = Number(t.fee);
  return {
    media: Array.isArray(t.media) ? t.media.filter((m): m is string => typeof m === "string" && (MEDIA as readonly string[]).includes(m)) : [],
    territory: str(t.territory, 120) || "Worldwide",
    term_months: Number.isFinite(months) && months >= 0 && months <= 1200 ? Math.round(months) : 12,
    exclusive: t.exclusive === true,
    fee: Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : fallbackFee,
    payment_terms: str(t.payment_terms, 500),
    deliverables: str(t.deliverables),
    approvals: t.approvals === true,
    attribution: str(t.attribution, 300),
    other: str(t.other, 4000),
  };
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0 });
export const termLabel = (months: number) => (months === 0 ? "No end date" : months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} month${months === 1 ? "" : "s"}`);

export function agreementClauses(t: AgreementTerms, p: AgreementParties): { heading: string; text: string }[] {
  const character = p.kind === "character";
  const clauses = [
    {
      heading: "1. The parties",
      text: `This agreement is between ${p.licensor} (“Licensor”) and ${p.licensee} (“Licensee”), made through tsayvish on ${p.date}.`,
    },
    character
      ? {
          heading: "2. What is licensed",
          text: `Licensor grants Licensee ${t.exclusive ? "an exclusive" : "a non-exclusive"} license to use the character “${p.property}”, including its name, likeness and the artwork Licensor supplies, ${t.media.length ? `for ${t.media.join(", ").toLowerCase()}` : "for the uses described below"}, ${where(t.territory)}.`,
        }
      : {
          heading: "2. The work",
          text: `Licensor will provide the service “${p.property}” to Licensee${t.exclusive ? " on an exclusive basis" : ""}, ${where(t.territory)}.`,
        },
    { heading: "3. Term", text: t.term_months === 0 ? "This agreement has no end date unless either party ends it under section 7." : `This agreement lasts ${termLabel(t.term_months)} from the date both parties sign it.` },
    { heading: "4. Fee", text: `Licensee will pay Licensor ${usd(t.fee)}. ${t.payment_terms || "Payment is due on signing."}` },
  ];
  if (t.deliverables) clauses.push({ heading: "5. Deliverables", text: t.deliverables });
  clauses.push({
    heading: `${clauses.length + 1}. Approvals and credit`,
    text: [
      t.approvals ? "Licensee will show Licensor each use before it is released, and won’t release it without Licensor’s written approval (email or tsayvish message is fine)." : "Licensee does not need Licensor’s approval for individual uses within the scope above.",
      t.attribution ? `Credit line: “${t.attribution}”.` : "",
    ].filter(Boolean).join(" "),
  });
  clauses.push({
    heading: `${clauses.length + 1}. Ownership and ending`,
    text: character
      ? "Licensor keeps all ownership of the character and its trademarks. Anything not expressly licensed here is reserved. Either party may end this agreement with written notice if the other seriously breaches it and doesn’t fix the breach within 30 days."
      : "Each party keeps ownership of what it brought. Either party may end this agreement with written notice if the other seriously breaches it and doesn’t fix the breach within 30 days.",
  });
  if (t.other) clauses.push({ heading: `${clauses.length + 1}. Additional terms`, text: t.other });
  return clauses;
}
