import Link from "next/link";
import { ProjectArt, projectBackground } from "./ProjectArt";
import { STATUS_LABEL, type Project } from "@/lib/types";
import { kindLabel } from "@/lib/content";
import { characterSubtitle } from "@/lib/existing";

/** One row in the project table. */
export function ProjectRow({ project }: { project: Project }) {
  const services = project.project_services ?? [];
  const on = services.filter((s) => s.status !== "off").length;
  const active = services.filter((s) => s.status === "active").length;

  const sub =
    project.type === "original"
      ? characterSubtitle(project, kindLabel)
      : `${project.company} · ${project.cast_members.join(", ")}`;

  const state =
    project.type === "original"
      ? on === 0
        ? "No services on"
        : `${on} service${on === 1 ? "" : "s"} on${active ? `, ${active} active` : ""}`
      : project.status
        ? STATUS_LABEL[project.status]
        : "";

  const created = new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link href={`/studio/p/${project.id}`} className="st-row">
      <span className="st-proj">
        <span className="st-thumb" style={{ background: projectBackground(project) }}>
          <ProjectArt project={project} />
        </span>
        <span className="st-proj-text">
          <b>{project.name}</b>
          <small>{sub}</small>
        </span>
      </span>
      <span className="st-type">
        <span className={`st-pill ${project.type}`}>{project.type === "original" ? "Original" : "Partnership"}</span>
      </span>
      <span className={`st-cell st-state ${project.type === "partnership" && project.status ? `s-${project.status}` : ""}`}>{state}</span>
      <span className="st-cell st-date">{created}</span>
    </Link>
  );
}
