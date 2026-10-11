import type { CharacterKind } from "@/components/art";
import type { PartnerInterest } from "./content";

export type ServiceStatus = "off" | "requested" | "active";
export type ProjectStatus = "submitted" | "in_review" | "approved" | "declined";
export type Details = Record<string, string | string[]>;

export type ProjectService = { service: string; status: ServiceStatus; details?: Details; updated_at?: string };

export type Project = {
  id: string;
  type: "original" | "partnership";
  name: string;
  kind: CharacterKind | null;
  color: string | null;
  personality: string | null;
  description: string | null;
  image_url: string | null;
  details: Details | null;
  company: string | null;
  interest: PartnerInterest | null;
  cast_members: string[];
  message: string | null;
  status: ProjectStatus | null;
  created_at: string;
  project_services?: ProjectService[];
};

export const PROJECT_COLUMNS =
  "id, type, name, kind, color, personality, description, image_url, details, company, interest, cast_members, message, status, created_at, project_services(service, status, details, updated_at)";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  declined: "Not this time",
};

export type CharacterInfo = {
  name?: string;
  kind?: CharacterKind;
  color?: string;
  personality?: string;
  image_url?: string | null;
};

export type Listing = {
  id: string;
  owner_id: string;
  type: "character" | "service";
  title: string;
  summary: string | null;
  description: string | null;
  category: string; // first of `categories`
  categories: string[];
  price: string | null;
  contact_email: string | null;
  seller_name: string | null;
  project_id: string | null;
  character_info: CharacterInfo;
  status: "published" | "hidden";
  created_at: string;
};

export const LISTING_COLUMNS =
  "id, owner_id, type, title, summary, description, category, categories, price, contact_email, seller_name, project_id, character_info, status, created_at";
