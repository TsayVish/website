import Link from "next/link";
import { ProjectArt, projectBackground } from "./ProjectArt";
import { STATUS_LABEL, type Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  const services = project.project_services ?? [];
  const on = services.filter((s) => s.status !== "off");
  const active = services.filter((s) => s.status === "active").length;

  const meta =
    project.type === "original"
      ? `${project.personality} · ${project.kind}`
      : `${project.interest} · ${project.cast_members.join(", ")}`;

  const footer =
    project.type === "original"
      ? on.length === 0
        ? "No services on yet"
        : `${on.length} service${on.length === 1 ? "" : "s"} on${active ? ` · ${active} active` : ""}`
      : project.status
        ? STATUS_LABEL[project.status]
        : "";

  return (
    <Link href={`/studio/p/${project.id}`} className="st-card">
      <div className="st-card-pic" style={{ background: projectBackground(project) }}>
        <ProjectArt project={project} />
      </div>
      <div className="st-card-body">
        <span className={`st-pill ${project.type}`}>{project.type === "original" ? "Original" : "Partnership"}</span>
        <h3>{project.name}</h3>
        <p className="st-meta">{meta}</p>
        <p className={`st-foot ${project.type === "partnership" && project.status ? `s-${project.status}` : ""}`}>{footer}</p>
      </div>
    </Link>
  );
}
