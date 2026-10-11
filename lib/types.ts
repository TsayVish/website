import type { CharacterKind } from "@/components/art";
import type { PartnerInterest } from "./content";

export type ServiceStatus = "off" | "requested" | "active";
export type ProjectStatus = "submitted" | "in_review" | "approved" | "declined";

export type ProjectService = { service: string; status: ServiceStatus };

export type Project = {
  id: string;
  type: "original" | "partnership";
  name: string;
  kind: CharacterKind | null;
  color: string | null;
  personality: string | null;
  description: string | null;
  company: string | null;
  interest: PartnerInterest | null;
  cast_members: string[];
  message: string | null;
  status: ProjectStatus | null;
  created_at: string;
  project_services?: ProjectService[];
};

export const PROJECT_COLUMNS =
  "id, type, name, kind, color, personality, description, company, interest, cast_members, message, status, created_at, project_services(service, status)";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  declined: "Not this time",
};
