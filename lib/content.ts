import type { CharacterKind, CritterSpec, PropKind } from "@/components/art";

export const CONTACT_EMAIL = "hello@tsayvish.com";

/* The in-house cast. Early concepts, shown for illustration. */
export type CastMember = CritterSpec & { line: string; status: string; hot?: boolean };

export const CAST: CastMember[] = [
  { name: "Pudding", species: "Frog", body: "var(--mint)", ears: "frog", prop: "sweat",
    line: "Says she’s fine. Is not fine. Rehearses every phone call twice.", status: "Breakout signal", hot: true },
  { name: "Gus", species: "Capybara", body: "var(--peach)", ears: "tiny", shape: "box", prop: "leaf",
    line: "Color-codes his calendar. Still twenty minutes late to everything.", status: "Testing" },
  { name: "Pip", species: "Hamster", body: "var(--pink)", ears: "small", prop: "sparkle",
    line: "Romanticizes errands. Main-character energy in the cereal aisle.", status: "Testing" },
  { name: "Dot", species: "Otter", body: "var(--sky)", ears: "tiny", prop: "bubble",
    line: "Sends seven-minute voice notes. Never listens to yours.", status: "Testing" },
  { name: "Sorrel", species: "Cat", body: "var(--lilac)", ears: "pointy", eyes: "sleepy", prop: "zz",
    line: "Cancels plans and feels wonderful about it. Patron saint of staying in.", status: "Breakout signal", hot: true },
  { name: "Bramble", species: "Bear", body: "var(--butter)", ears: "round", prop: "band",
    line: "Training for his first 5K. Mostly by buying the gear.", status: "Testing" },
];

/* Everything tsayvish handles, grouped into four lanes. */
export type Service = { name: string; text: string; detail: string };
export type Lane = { name: string; color: string; items: Service[] };

export const LANES: Lane[] = [
  { name: "Create", color: "var(--butter)", items: [
    { name: "Character creation", text: "Personality first, then the face. Every character starts with a want, a flaw and a running joke.", detail: "Personality bible · visual spec · voice" },
    { name: "Creative management", text: "A writers’ room and production calendar for daily formats across every feed.", detail: "Series formats · posting cadence" },
    { name: "Technology", text: "Our generation pipeline keeps characters on-model across thousands of clips and shows what’s working.", detail: "Model tuning · consistency · analytics" },
  ]},
  { name: "Protect", color: "var(--sky)", items: [
    { name: "Likeness", text: "A locked look, voice and set of mannerisms, with clear rules on who can use them and how.", detail: "Style guide · voice lock · usage rights" },
    { name: "IP & trademark filing", text: "Names, marks and designs filed in the classes where the revenue is.", detail: "Nice classes 9 · 16 · 25 · 28 · 41" },
    { name: "Legal paperwork", text: "Licensing deals, brand partnerships, creator agreements and takedowns.", detail: "Licenses · contracts · enforcement" },
  ]},
  { name: "Grow", color: "var(--mint)", items: [
    { name: "Audience management", text: "Comments, community, fan art and the inside jokes that turn viewers into fans.", detail: "Community · moderation · fan programs" },
    { name: "Media budgeting & management", text: "Paid spend goes behind what already works organically, tracked to the dollar.", detail: "Budgets · paid amplification · reporting" },
    { name: "Live events", text: "Pop-ups, meet-and-greets and launch drops where fans meet the character in person.", detail: "Pop-ups · appearances · drops" },
  ]},
  { name: "Earn", color: "var(--pink)", items: [
    { name: "Storefront", text: "A shop for every character, from the first pre-order to a full catalog.", detail: "Pre-orders · drops · catalog" },
    { name: "Payments", text: "Checkout, payouts, royalty splits and licensing revenue, all in one ledger.", detail: "Checkout · royalties · payouts" },
    { name: "Physical goods", text: "Plush, blind boxes, apparel and books, from first sample to the customer’s door.", detail: "Sampling · manufacturing · fulfillment" },
  ]},
];

/* Character builder options. */
export const KINDS: CharacterKind[] = ["Person", "Creature", "Robot", "Food", "Object", "Animal"];

export const COLORS: { name: string; value: string }[] = [
  { name: "Mint", value: "var(--mint)" },
  { name: "Peach", value: "var(--peach)" },
  { name: "Pink", value: "var(--pink)" },
  { name: "Sky", value: "var(--sky)" },
  { name: "Lilac", value: "var(--lilac)" },
  { name: "Butter", value: "var(--butter)" },
];

export type Mood = { name: string; prop: PropKind; sleepy?: boolean; line: string };

export const MOODS: Mood[] = [
  { name: "Anxious", prop: "sweat", line: "Replays every conversation from 2019. Apologizes to furniture." },
  { name: "Overachiever", prop: "band", line: "Has a five-year plan for brunch. Already on year three." },
  { name: "Dreamy", prop: "sparkle", line: "Romanticizes doing laundry. Narrates life like a film." },
  { name: "Chatty", prop: "bubble", line: "Sends voice notes longer than most podcasts." },
  { name: "Homebody", prop: "zz", sleepy: true, line: "Considers leaving the house a side quest." },
  { name: "Chill", prop: "leaf", line: "Has never once been in a hurry. Will not start now." },
];

export const INFRA: { name: string; detail: string; on: boolean }[] = [
  { name: "Trademark filing", detail: "Nice classes 9 · 25 · 28 · 41", on: true },
  { name: "Likeness lock", detail: "Style guide · voice · usage rules", on: true },
  { name: "Storefront", detail: "Pre-orders · drops · catalog", on: true },
  { name: "Payments", detail: "Checkout · royalties · payouts", on: true },
  { name: "Physical goods", detail: "Plush · apparel · blind boxes", on: false },
  { name: "Audience tools", detail: "Community · moderation · fan programs", on: false },
  { name: "Media budget", detail: "Paid amplification · reporting", on: false },
  { name: "Live events", detail: "Pop-ups · appearances · drops", on: false },
];

export const PARTNER_INTERESTS = ["Brand partnership", "Licensing", "Manufacturing", "Something else"] as const;
export type PartnerInterest = (typeof PARTNER_INTERESTS)[number];

export function colorValue(name: string | null | undefined) {
  return (COLORS.find((c) => c.name === name) ?? COLORS[0]).value;
}

export function moodByName(name: string | null | undefined) {
  return MOODS.find((m) => m.name === name) ?? MOODS[0];
}

export function castByName(name: string) {
  return CAST.find((c) => c.name === name);
}
