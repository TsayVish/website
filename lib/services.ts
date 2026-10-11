// What each project tab asks for. Adding a field here adds it to the form;
// answers are saved as JSON (project_services.details or projects.details).

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multi" | "url";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  help?: string;
  wide?: boolean;
};

export type ServiceDef = {
  slug: string;
  name: string; // must match project_services.service
  tab: string; // short label for the tab bar
  summary: string;
  fields: Field[];
};

const TERRITORIES = ["United States", "Canada", "United Kingdom", "European Union", "Japan", "South Korea", "China", "Australia", "Worldwide"];

export const SERVICE_DEFS: ServiceDef[] = [
  {
    slug: "trademark", name: "Trademark filing", tab: "Trademark",
    summary: "We file the character’s name, marks and design in the classes and countries you choose.",
    fields: [
      { key: "marks", label: "Names and phrases to protect", type: "textarea", placeholder: "Character name, catchphrases, logo wordmark…", wide: true },
      { key: "classes", label: "Nice classes", type: "multi", options: ["9 · Digital goods", "16 · Paper & books", "25 · Apparel", "28 · Toys", "41 · Entertainment", "43 · Food & drink"], wide: true },
      { key: "territories", label: "Countries and regions", type: "multi", options: TERRITORIES, wide: true },
      { key: "existing", label: "Already filed anywhere?", type: "select", options: ["No", "Yes, pending", "Yes, registered"] },
      { key: "notes", label: "Notes for our legal team", type: "textarea", wide: true },
    ],
  },
  {
    slug: "likeness", name: "Likeness lock", tab: "Likeness",
    summary: "A locked look, voice and personality, with rules for who can use them and how.",
    fields: [
      { key: "voice", label: "Voice and tone", type: "textarea", placeholder: "How does the character talk? Words they use, words they never use.", wide: true },
      { key: "traits", label: "Signature traits", type: "textarea", placeholder: "Catchphrases, habits, running jokes, signature props.", wide: true },
      { key: "dos", label: "Always", type: "textarea", placeholder: "Things the character always does." },
      { key: "donts", label: "Never", type: "textarea", placeholder: "Off-limits topics, brands, behaviours." },
      { key: "usage", label: "Who may use the likeness", type: "select", options: ["Only us", "Approved partners", "Anyone with a license"] },
      { key: "approval", label: "Approval needed for new content?", type: "select", options: ["Yes, always", "Only for paid partnerships", "No"] },
    ],
  },
  {
    slug: "storefront", name: "Storefront", tab: "Storefront",
    summary: "A shop for the character, from the first pre-order to a full catalog.",
    fields: [
      { key: "store_name", label: "Store name", type: "text", placeholder: "Mango’s Snack Shack" },
      { key: "handle", label: "Preferred web address", type: "text", placeholder: "shop.tsayvish.com/mango" },
      { key: "launch_type", label: "Launch style", type: "select", options: ["Pre-orders", "Limited drop", "Always open"] },
      { key: "launch_date", label: "Target launch date", type: "date" },
      { key: "products", label: "First products", type: "textarea", placeholder: "What should be in the shop on day one?", wide: true },
      { key: "existing_url", label: "Existing shop, if any", type: "url", placeholder: "https://" },
    ],
  },
  {
    slug: "payments", name: "Payments", tab: "Payments",
    summary: "Checkout, payouts and royalty splits. Bank details are collected later by our payments partner, never on this page.",
    fields: [
      { key: "legal_name", label: "Legal name or business name", type: "text" },
      { key: "country", label: "Country for payouts", type: "select", options: ["United States", "Canada", "United Kingdom", "European Union", "Australia", "Other"] },
      { key: "currency", label: "Currency", type: "select", options: ["USD", "CAD", "GBP", "EUR", "AUD"] },
      { key: "payout_schedule", label: "Payout schedule", type: "select", options: ["Weekly", "Monthly", "Quarterly"] },
      { key: "splits", label: "Royalty splits", type: "textarea", placeholder: "Who gets what? e.g. Creator 70%, illustrator 30%.", wide: true },
    ],
  },
  {
    slug: "goods", name: "Physical goods", tab: "Physical goods",
    summary: "Plush, blind boxes, apparel and more, from first sample to the customer’s door.",
    fields: [
      { key: "products", label: "Products", type: "multi", options: ["Plush", "Blind boxes", "Figures", "Apparel", "Stickers", "Pins", "Books", "Stationery"], wide: true },
      { key: "units", label: "First run (units)", type: "number", placeholder: "500" },
      { key: "budget", label: "Budget", type: "select", options: ["Under $5k", "$5k–$20k", "$20k–$50k", "$50k+", "Not sure yet"] },
      { key: "sample_date", label: "Samples needed by", type: "date" },
      { key: "ship_to", label: "Ship to", type: "multi", options: TERRITORIES },
      { key: "notes", label: "Notes", type: "textarea", placeholder: "Materials, sizes, packaging ideas…", wide: true },
    ],
  },
  {
    slug: "audience", name: "Audience tools", tab: "Audience",
    summary: "Community, moderation and fan programs across the character’s channels.",
    fields: [
      { key: "tiktok", label: "TikTok", type: "text", placeholder: "@handle" },
      { key: "instagram", label: "Instagram", type: "text", placeholder: "@handle" },
      { key: "youtube", label: "YouTube", type: "text", placeholder: "@channel" },
      { key: "other_social", label: "Other channels", type: "text", placeholder: "X, Threads, Twitch…" },
      { key: "community", label: "Community space", type: "select", options: ["None yet", "Discord", "Instagram broadcast channel", "Newsletter", "Other"] },
      { key: "moderation", label: "Moderation", type: "select", options: ["Light", "Standard", "Strict (younger audience)"] },
      { key: "programs", label: "Fan programs you want", type: "multi", options: ["Fan art features", "Ambassadors", "Early access", "Giveaways", "Meet-ups"], wide: true },
    ],
  },
  {
    slug: "media", name: "Media budget", tab: "Media",
    summary: "Paid spend behind what already works organically, tracked to the dollar.",
    fields: [
      { key: "monthly_budget", label: "Monthly budget (USD)", type: "number", placeholder: "1000" },
      { key: "goal", label: "Main goal", type: "select", options: ["Followers", "Views", "Sales", "Sign-ups"] },
      { key: "channels", label: "Channels", type: "multi", options: ["TikTok", "Instagram", "YouTube", "Meta ads", "Snapchat", "Pinterest"], wide: true },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "markets", label: "Target markets", type: "multi", options: TERRITORIES, wide: true },
    ],
  },
  {
    slug: "events", name: "Live events", tab: "Live events",
    summary: "Pop-ups, meet-and-greets and drops where fans meet the character in person.",
    fields: [
      { key: "types", label: "Event types", type: "multi", options: ["Pop-up shop", "Meet & greet", "Convention booth", "Launch party", "Brand activation"], wide: true },
      { key: "cities", label: "Cities", type: "text", placeholder: "New York, Los Angeles…" },
      { key: "timing", label: "Timing", type: "text", placeholder: "Spring 2027" },
      { key: "audience_size", label: "Expected audience", type: "select", options: ["Under 100", "100–500", "500–2,000", "2,000+"] },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

export const serviceBySlug = (slug: string) => SERVICE_DEFS.find((s) => s.slug === slug);

/** Deal terms for partnership projects (saved in projects.details). */
export const DEAL_FIELDS: Field[] = [
  { key: "territories", label: "Territories", type: "multi", options: TERRITORIES, wide: true },
  { key: "categories", label: "Product categories", type: "multi", options: ["Plush", "Apparel", "Toys & figures", "Food & drink", "Beauty", "Stationery", "Digital", "Media & content"], wide: true },
  { key: "launch_date", label: "Target launch", type: "date" },
  { key: "units", label: "Estimated units", type: "number" },
  { key: "budget", label: "Budget range", type: "select", options: ["Under $25k", "$25k–$100k", "$100k–$500k", "$500k+", "Not sure yet"] },
  { key: "duration", label: "Term", type: "select", options: ["One-off", "6 months", "1 year", "2+ years"] },
  { key: "website", label: "Company website", type: "url", placeholder: "https://" },
  { key: "notes", label: "Anything else", type: "textarea", wide: true },
];

/** Marketplace */
export const CHARACTER_LISTING_CATEGORIES = ["Available to license", "Open to collaborations", "Commission me"];
export const SERVICE_LISTING_CATEGORIES = [
  "Illustration & design", "Animation & video", "Voice & music", "Writing",
  "Legal & IP", "Manufacturing", "Marketing & growth", "Events", "Other",
];
