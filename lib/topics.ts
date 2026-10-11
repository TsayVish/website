import { CHARACTER_LISTING_CATEGORIES, SERVICE_LISTING_CATEGORIES } from "./services";

export type Topic = { name: string; color: string; icon: TopicIcon; blurb: string };
export type TopicIcon = "key" | "handshake" | "star" | "pen" | "film" | "mic" | "book" | "shield" | "box" | "megaphone" | "ticket" | "dots";

/** Marketplace categories, presented as topics on Discover. */
export const TOPICS: Topic[] = [
  { name: "Available to license", color: "var(--butter)", icon: "key", blurb: "Characters ready for your brand" },
  { name: "Open to collaborations", color: "var(--pink)", icon: "handshake", blurb: "Creators looking for partners" },
  { name: "Commission me", color: "var(--lilac)", icon: "star", blurb: "Custom characters on request" },
  { name: "Illustration & design", color: "var(--sky)", icon: "pen", blurb: "Artists and designers" },
  { name: "Animation & video", color: "var(--peach)", icon: "film", blurb: "Motion, edits and shorts" },
  { name: "Voice & music", color: "var(--mint)", icon: "mic", blurb: "Voices, jingles and sound" },
  { name: "Writing", color: "var(--lilac)", icon: "book", blurb: "Scripts, lore and copy" },
  { name: "Legal & IP", color: "var(--sky)", icon: "shield", blurb: "Trademarks and contracts" },
  { name: "Manufacturing", color: "var(--peach)", icon: "box", blurb: "Plush, toys and merch" },
  { name: "Marketing & growth", color: "var(--pink)", icon: "megaphone", blurb: "Audience and paid media" },
  { name: "Events", color: "var(--butter)", icon: "ticket", blurb: "Pop-ups and appearances" },
  { name: "Other", color: "var(--mint)", icon: "dots", blurb: "Everything else" },
];

export const ALL_CATEGORIES = [...CHARACTER_LISTING_CATEGORIES, ...SERVICE_LISTING_CATEGORIES];
export const topicByName = (name: string) => TOPICS.find((t) => t.name === name);
