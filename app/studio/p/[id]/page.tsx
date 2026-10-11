import Link from "next/link";
import { notFound } from "next/navigation";
import { Critter } from "@/components/art";
import { CharacterBuilder } from "@/components/CharacterBuilder";
import { DealForm } from "@/components/studio/DealForm";
import { DeleteProject } from "@/components/studio/DeleteProject";
import { PartnerForm } from "@/components/studio/PartnerForm";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { ServiceForm } from "@/components/studio/ServiceForm";
import { UploadCharacterForm } from "@/components/studio/UploadCharacterForm";
import { castByName, kindLabel } from "@/lib/content";
import { characterSubtitle, isExisting } from "@/lib/existing";
import { DEAL_FIELDS, SERVICE_DEFS } from "@/lib/services";
import { MoveToWorkspace } from "@/components/studio/team/MoveToWorkspace";
import { AssetLibrary } from "@/components/studio/character/AssetLibrary";
import { RestoreVersionButton } from "@/components/studio/character/RestoreVersionButton";
import { StyleGuideForm } from "@/components/studio/character/StyleGuideForm";
import { ASSET_COLUMNS, describeChange, readStyleGuide, type CharacterAsset, type CharacterVersion } from "@/lib/characters";
import { fmtDate } from "@/lib/hub";
import { money } from "@/lib/offers";
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
        { slug: "assets", label: "Assets" },
        { slug: "style", label: "Style guide" },
        { slug: "history", label: "History" },
        { slug: "licenses", label: "Licenses" },
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

  // Character record tabs load only what they show.
  const { data: canEditData } = await supabase.rpc("can_edit_project", { pid: project.id });
  const canEdit = canEditData === true;
  const assets = isOriginal && current === "assets"
    ? (((await supabase.from("character_assets").select(ASSET_COLUMNS).eq("project_id", project.id).order("created_at", { ascending: false })).data ?? []) as CharacterAsset[])
    : [];
  const versions = isOriginal && current === "history"
    ? (((await supabase.from("character_versions").select("id, snapshot, changed_by, created_at").eq("project_id", project.id).order("created_at", { ascending: false }).limit(50)).data ?? []) as CharacterVersion[])
    : [];
  let licenses: { id: string; title: string; buyer: string; amount: number; at: string | null; signed: boolean }[] = [];
  if (isOriginal && current === "licenses") {
    const { data: ls } = await supabase.from("listings").select("id, title").eq("project_id", project.id);
    const listingRows = (ls ?? []) as { id: string; title: string }[];
    if (listingRows.length) {
      const { data: os } = await supabase.from("offers").select("id, listing_id, buyer_id, amount, responded_at")
        .in("listing_id", listingRows.map((l) => l.id)).eq("status", "accepted").order("responded_at", { ascending: false });
      const offers = (os ?? []) as { id: string; listing_id: string; buyer_id: string; amount: number; responded_at: string | null }[];
      const [{ data: ps }, { data: ags }] = await Promise.all([
        offers.length ? supabase.from("profiles").select("id, full_name").in("id", offers.map((o) => o.buyer_id)) : Promise.resolve({ data: [] }),
        offers.length ? supabase.from("agreements").select("offer_id, status").in("offer_id", offers.map((o) => o.id)) : Promise.resolve({ data: [] }),
      ]);
      const names = new Map(((ps ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
      const signed = new Set(((ags ?? []) as { offer_id: string; status: string }[]).filter((a) => a.status === "signed").map((a) => a.offer_id));
      licenses = offers.map((o) => ({
        id: o.id, title: listingRows.find((l) => l.id === o.listing_id)?.title ?? "Listing",
        buyer: names.get(o.buyer_id) || "A member", amount: o.amount, at: o.responded_at, signed: signed.has(o.id),
      }));
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isCreator = project.owner_id === user?.id;
  let editableWorkspaces: { id: string; name: string }[] = [];
  let workspaceName: string | null = null;
  if (isOriginal && current === "overview") {
    const { data: wsRows } = await supabase.from("workspaces").select("id, name").order("name");
    const all = (wsRows ?? []) as { id: string; name: string }[];
    workspaceName = all.find((w) => w.id === project.workspace_id)?.name ?? null;
    if (isCreator) {
      const roles = await Promise.all(all.map((w) => supabase.rpc("workspace_role", { ws: w.id })));
      editableWorkspaces = all.filter((_, i) => ["owner", "editor"].includes(String(roles[i].data)));
    }
  }
  const serviceUpdates = isOriginal && serviceDef
    ? (((await supabase.from("service_updates").select("id, body, created_at").eq("project_id", project.id).eq("service", serviceDef.name).order("created_at", { ascending: false })).data ?? []) as { id: string; body: string; created_at: string }[])
    : [];
  const currentSnapshot: Record<string, unknown> = {
    name: project.name, kind: project.kind, color: project.color, personality: project.personality,
    description: project.description, image_url: project.image_url, style_guide: project.style_guide ?? {},
  };

  return (
    <div className="st-stack st-project">
      <div className="st-crumbs">
        <Link href={isOriginal ? "/studio/hub/characters" : "/studio/projects"}>{isOriginal ? "Characters" : "Projects"}</Link><span>/</span><span>{isOriginal ? "Original" : "Partnership"}</span>
      </div>

      <div className="st-project-head">
        <div className="st-project-pic" style={{ background: projectBackground(project) }}>
          <ProjectArt project={project} />
        </div>
        <div className="st-project-meta">
          <h1>{project.name}</h1>
          {isOriginal ? (
            <p className="st-meta">
              <span className="st-pill original">Original</span> · {characterSubtitle(project, kindLabel)} · added {fmt(project.created_at)}
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
              {isCreator ? (
                <MoveToWorkspace projectId={project.id} current={project.workspace_id ?? null} workspaces={editableWorkspaces} />
              ) : (
                <p className="st-help">Shared with you through {workspaceName ?? "a workspace"}.</p>
              )}
              {canEdit && <Link className="btn ghost st-small" href={href("character")}>Edit character</Link>}
            </div>
            <div className="panel st-next">
              <b className="st-panel-title">How services work</b>
              <p>Open a service to fill in the details and request it. When our team has it set up, it shows as <span className="st-status active">Active</span>.</p>
              {canEdit && <DeleteProject projectId={project.id} label="Delete this project" />}
            </div>
          </div>
        </div>
      )}

      {isOriginal && current === "character" && isExisting(project.details) && (
        <UploadCharacterForm
          initial={{ id: project.id, name: project.name, color: project.color, description: project.description, image_url: project.image_url, details: project.details }}
        />
      )}

      {isOriginal && current === "character" && project.kind && !isExisting(project.details) && (
        <CharacterBuilder
          mode="edit"
          initial={{
            id: project.id, name: project.name, kind: project.kind, color: project.color ?? "Mint",
            personality: project.personality ?? "Dreamy", description: project.description, image_url: project.image_url,
          }}
        />
      )}

      {isOriginal && current === "assets" && <AssetLibrary projectId={project.id} assets={assets} canEdit={canEdit} />}

      {isOriginal && current === "style" && <StyleGuideForm projectId={project.id} initial={readStyleGuide(project.style_guide)} canEdit={canEdit} />}

      {isOriginal && current === "history" && (
        versions.length === 0 ? (
          <div className="hub-empty"><h2>No earlier versions</h2><p>Each time this character’s name, look, description or style guide changes, the previous version is saved here.</p></div>
        ) : (
          <div className="st-table">
            <div className="st-row st-row-head ch-ver-row" aria-hidden="true"><span>Version</span><span>Changes after it</span><span>Saved</span><span /></div>
            {versions.map((v, i) => {
              const after = i === 0 ? currentSnapshot : versions[i - 1].snapshot;
              return (
                <div key={v.id} className="st-row ch-ver-row">
                  <span className="st-proj-text"><b>{String(v.snapshot.name ?? "Untitled")}</b><small>{[v.snapshot.personality, v.snapshot.kind].filter(Boolean).join(" · ")}</small></span>
                  <span className="st-cell">{describeChange(v.snapshot, after)}</span>
                  <span className="st-cell">{fmtDate(v.created_at)}</span>
                  <span className="hub-row-actions">{canEdit && <RestoreVersionButton versionId={v.id} />}</span>
                </div>
              );
            })}
          </div>
        )
      )}

      {isOriginal && current === "licenses" && (
        licenses.length === 0 ? (
          <div className="hub-empty"><h2>No licenses yet</h2><p>When you accept an offer on a Marketplace listing for {project.name}, the license shows up here.</p>
            <Link className="btn st-small" href="/studio/marketplace/new">List this character</Link></div>
        ) : (
          <div className="st-table">
            <div className="st-row st-row-head ch-lic-row" aria-hidden="true"><span>Licensee</span><span>Listing</span><span>Fee</span><span>Agreement</span><span>Agreed</span></div>
            {licenses.map((l) => (
              <Link key={l.id} href={`/studio/deals/${l.id}`} className="st-row ch-lic-row">
                <span className="st-proj-text"><b>{l.buyer}</b></span>
                <span className="st-cell">{l.title}</span>
                <span className="st-cell of-amount">{money(l.amount)}</span>
                <span><span className={`st-status ${l.signed ? "active" : "requested"}`}>{l.signed ? "Signed" : "Not signed"}</span></span>
                <span className="st-cell">{fmtDate(l.at)}</span>
              </Link>
            ))}
          </div>
        )
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

      {isOriginal && serviceDef && serviceUpdates.length > 0 && (
        <section className="panel sv-updates" aria-label="Updates from the tsayvish team">
          <b className="st-panel-title">Updates from the tsayvish team</b>
          <ul>
            {serviceUpdates.map((u) => <li key={u.id}><p>{u.body}</p><small className="st-muted">{fmtDate(u.created_at)}</small></li>)}
          </ul>
        </section>
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
