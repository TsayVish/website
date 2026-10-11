import Link from "next/link";
import { notFound } from "next/navigation";
import { Critter } from "@/components/art";
import { DeleteProject } from "@/components/studio/DeleteProject";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { ServicesPanel } from "@/components/studio/ServicesPanel";
import { castByName, moodByName } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, STATUS_LABEL, type Project, type ProjectStatus, type ServiceStatus } from "@/lib/types";

const STEPS: ProjectStatus[] = ["submitted", "in_review", "approved"];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const project = data as unknown as Project;

  const created = new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="st-stack">
      <div className="st-crumbs">
        <Link href="/studio">Projects</Link><span>/</span><span>{project.type === "original" ? "Original" : "Partnership"}</span>
      </div>

      <div className="st-project-head">
        <div className="st-project-pic" style={{ background: projectBackground(project) }}>
          <ProjectArt project={project} />
        </div>
        <div className="st-project-meta">
          <h1>{project.name}</h1>
          {project.type === "original" ? (
            <p className="st-meta">
              <span className="st-pill original">Original</span> · {project.personality} {project.kind?.toLowerCase()} · created {created}
            </p>
          ) : (
            <p className="st-meta">
              <span className="st-pill partnership">Partnership</span> · {project.company} · sent {created}
            </p>
          )}
        </div>
      </div>

      {project.type === "original" ? (
        <div className="st-two">
          <ServicesPanel
            projectId={project.id}
            initial={Object.fromEntries((project.project_services ?? []).map((s) => [s.service, s.status as ServiceStatus]))}
          />
          <div className="panel st-next">
            <b className="st-panel-title">About {project.name}</b>
            <p>
              {project.description ? `${project.description.replace(/[.!?]+$/, "")}. ` : ""}
              {moodByName(project.personality).line}
            </p>
            <b className="st-panel-title">What happens next</b>
            <p>Each service you switch on goes to our team as a request. When it’s set up, it shows as <span className="st-status active">Active</span> here.</p>
            <p>Want to change the look or personality? Start a new original for now. Editing is coming soon.</p>
            <DeleteProject projectId={project.id} label="Delete this project" />
          </div>
        </div>
      ) : (
        <div className="st-two">
          <div className="panel">
            <b className="st-panel-title">Status</b>
            {project.status === "declined" ? (
              <p className="st-muted">We can’t take this one on right now. Thanks for thinking of us, and feel free to send another request.</p>
            ) : (
              <ol className="st-steps">
                {STEPS.map((step) => {
                  const reached = STEPS.indexOf(step) <= STEPS.indexOf((project.status ?? "submitted") as ProjectStatus);
                  return (
                    <li key={step} className={reached ? "done" : ""}>
                      {STATUS_LABEL[step]}
                    </li>
                  );
                })}
              </ol>
            )}
            <b className="st-panel-title">Characters</b>
            <div className="st-castlist">
              {project.cast_members.map((n) => {
                const c = castByName(n);
                return c ? (
                  <div key={n} className="st-castmini">
                    <span style={{ background: `color-mix(in srgb, ${c.body} 40%, var(--surface))` }}><Critter {...c} /></span>
                    {n}
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <div className="panel st-next">
            <b className="st-panel-title">Details</b>
            <dl className="st-dl">
              <dt>Company</dt><dd>{project.company}</dd>
              <dt>Type</dt><dd>{project.interest}</dd>
              <dt>Sent</dt><dd>{created}</dd>
            </dl>
            <b className="st-panel-title">Your message</b>
            <p className="st-message">{project.message || "No message added."}</p>
            <DeleteProject projectId={project.id} label="Withdraw this request" />
          </div>
        </div>
      )}
    </div>
  );
}
