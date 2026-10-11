import Link from "next/link";
import { notFound } from "next/navigation";
import { Critter } from "@/components/art";
import { CharacterBuilder } from "@/components/CharacterBuilder";
import { DealForm } from "@/components/studio/DealForm";
import { DeleteProject } from "@/components/studio/DeleteProject";
import { PartnerForm } from "@/components/studio/PartnerForm";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { ServiceForm } from "@/components/studio/ServiceForm";
import { castByName, kindLabel } from "@/lib/content";
import { DEAL_FIELDS, SERVICE_DEFS } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, STATUS_LABEL, type Details, type Project, type ProjectStatus, type ServiceStatus } from "@/lib/types";

const STEPS: ProjectStatus[] = ["submitted", "in_review", "approved"];
const STATUS_TEXT: Record<ServiceStatus, string> = { off: "Off", requested: "Requested", active: "Active" };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const answered = (d: Details | undefined | null) =>
  Object.values(d ?? {}).filter((v) => (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "")).length;

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const project = data as unknown as Project;
  const isOriginal = project.type === "original";

  const services = new Map((project.project_services ?? []).map((s) => [s.service, s]));
  const statusOf = (name: string): ServiceStatus => (services.get(name)?.status as ServiceStatus) ?? "off";

  const tabs: { slug: string; label: string; status?: ServiceStatus }[] = isOriginal
    ? [
        { slug: "overview", label: "Overview" },
        { slug: "character", label: "Character" },
        ...SERVICE_DEFS.map((d) => ({ slug: d.slug, label: d.tab, status: statusOf(d.name) })),
      ]
    : [
        { slug: "overview", label: "Overview" },
        { slug: "request", label: "Request" },
        { slug: "deal", label: "Deal terms" },
      ];
  const current = tabs.some((t) => t.slug === tab) ? (tab as string) : "overview";
  const href = (slug: string) => (slug === "overview" ? `/studio/p/${project.id}` : `/studio/p/${project.id}?tab=${slug}`);
  const serviceDef = SERVICE_DEFS.find((d) => d.slug === current);

  return (
    <div className="st-stack st-project">
      <div className="st-crumbs">
        <Link href="/studio/projects">Projects</Link><span>/</span><span>{isOriginal ? "Original" : "Partnership"}</span>
      </div>

      <div className="st-project-head">
        <div className="st-project-pic" style={{ background: projectBackground(project) }}>
          <ProjectArt project={project} />
        </div>
        <div className="st-project-meta">
          <h1>{project.name}</h1>
          {isOriginal ? (
            <p className="st-meta">
              <span className="st-pill original">Original</span> · {project.personality} · {kindLabel(project.kind).toLowerCase()} · created {fmt(project.created_at)}
            </p>
          ) : (
            <p className="st-meta">
              <span className="st-pill partnership">Partnership</span> · {project.company} ·{" "}
              {project.status ? STATUS_LABEL[project.status] : ""} · sent {fmt(project.created_at)}
            </p>
          )}
        </div>
      </div>

      <nav className="st-ptabs" aria-label="Project sections">
        {tabs.map((t) => (
          <Link key={t.slug} href={href(t.slug)} aria-current={current === t.slug ? "page" : undefined}>
            {t.status && <span className={`st-dot ${t.status}`} aria-label={STATUS_TEXT[t.status]} />}
            {t.label}
          </Link>
        ))}
      </nav>

      {/* ── Originals ── */}
      {isOriginal && current === "overview" && (
        <div className="st-stack">
          <div className="st-table">
            <div className="st-row st-row-head st-svc-row" aria-hidden="true">
              <span>Service</span><span>Status</span><span>Details</span><span className="st-date">Updated</span>
            </div>
            {SERVICE_DEFS.map((d) => {
              const s = services.get(d.name);
              const status = statusOf(d.name);
              const n = answered(s?.details);
              return (
                <Link key={d.slug} href={href(d.slug)} className="st-row st-svc-row">
                  <span className="st-proj-text"><b>{d.name}</b><small>{d.summary}</small></span>
                  <span><span className={`st-status ${status}`}>{STATUS_TEXT[status]}</span></span>
                  <span className="st-cell">{n ? `${n} of ${d.fields.length} filled` : "Not started"}</span>
                  <span className="st-cell st-date">{s?.updated_at ? fmt(s.updated_at) : "—"}</span>
                </Link>
              );
            })}
          </div>
          <div className="st-two st-even">
            <div className="panel st-next">
              <b className="st-panel-title">About {project.name}</b>
              <p>{project.description || "No description yet. Add one in the Character tab."}</p>
              <Link className="btn ghost st-small" href={href("character")}>Edit character</Link>
            </div>
            <div className="panel st-next">
              <b className="st-panel-title">How services work</b>
              <p>Open a service to fill in the details and request it. When our team has it set up, it shows as <span className="st-status active">Active</span>.</p>
              <DeleteProject projectId={project.id} label="Delete this project" />
            </div>
          </div>
        </div>
      )}

      {isOriginal && current === "character" && project.kind && (
        <CharacterBuilder
          mode="edit"
          initial={{
            id: project.id, name: project.name, kind: project.kind, color: project.color ?? "Mint",
            personality: project.personality ?? "Dreamy", description: project.description, image_url: project.image_url,
          }}
        />
      )}

      {isOriginal && serviceDef && (
        <ServiceForm
          key={serviceDef.slug}
          projectId={project.id}
          def={serviceDef}
          initialStatus={statusOf(serviceDef.name)}
          initialDetails={(services.get(serviceDef.name)?.details ?? {}) as Details}
          updatedAt={services.get(serviceDef.name)?.updated_at}
        />
      )}

      {/* ── Partnerships ── */}
      {!isOriginal && current === "overview" && (
        <div className="st-two">
          <div className="panel">
            <b className="st-panel-title">Status</b>
            {project.status === "declined" ? (
              <p className="st-muted">We can’t take this one on right now. Thanks for thinking of us, and feel free to send another request.</p>
            ) : (
              <ol className="st-steps">
                {STEPS.map((step) => {
                  const reached = STEPS.indexOf(step) <= STEPS.indexOf((project.status ?? "submitted") as ProjectStatus);
                  return <li key={step} className={reached ? "done" : ""}>{STATUS_LABEL[step]}</li>;
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
              <dt>Sent</dt><dd>{fmt(project.created_at)}</dd>
              <dt>Deal terms</dt>
              <dd>
                <Link href={href("deal")}>{answered(project.details) ? `${answered(project.details)} of ${DEAL_FIELDS.length} filled` : "Add deal terms"}</Link>
              </dd>
            </dl>
            <b className="st-panel-title">Your message</b>
            <p className="st-message">{project.message || "No message added."}</p>
            <DeleteProject projectId={project.id} label="Withdraw this request" />
          </div>
        </div>
      )}

      {!isOriginal && current === "request" && <PartnerForm initial={project} />}

      {!isOriginal && current === "deal" && <DealForm projectId={project.id} initialDetails={(project.details ?? {}) as Details} />}
    </div>
  );
}
