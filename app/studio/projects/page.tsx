import Link from "next/link";
import { ProjectRow } from "@/components/studio/ProjectCard";
import { StartCards } from "@/components/studio/StartCards";
import { IconPlus } from "@/components/studio/icons";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, type Project } from "@/lib/types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "original", label: "Originals" },
  { key: "partnership", label: "Partnerships" },
] as const;

export default async function StudioHome({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const filter = type === "original" || type === "partnership" ? type : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("profiles").select("full_name, goal").eq("id", user!.id).maybeSingle(),
    supabase.from("projects").select(PROJECT_COLUMNS).order("created_at", { ascending: false }),
  ]);

  const p = profile as { full_name: string | null; goal: string } | null;
  const firstName = p?.full_name?.split(" ")[0];
  const all = (rows ?? []) as unknown as Project[];
  const shown = filter === "all" ? all : all.filter((x) => x.type === filter);
  const count = (t: string) => (t === "all" ? all.length : all.filter((x) => x.type === t).length);

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <h1>Projects</h1>
          <p className="st-sub">{firstName ? `Welcome back, ${firstName}.` : "Welcome back."} Start something new or pick up where you left off.</p>
        </div>
        <div className="st-actions">
          <Link className="btn ghost" href="/studio/new/partner">New partnership</Link>
          <Link className="btn" href="/studio/new/original"><IconPlus /> New character</Link>
        </div>
      </div>

      <StartCards partnerFirst={p?.goal === "partner"} />

      <div className="st-section">
        <div className="st-section-head">
          <h2>All projects</h2>
          {all.length > 0 && (
            <nav className="st-tabs" aria-label="Filter projects">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/studio/projects" : `/studio/projects?type=${f.key}`}
                  aria-current={filter === f.key ? "page" : undefined}
                >
                  {f.label} <span className="st-count">{count(f.key)}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            Couldn’t load your projects: {error.message}. If this is a new setup, run supabase/schema.sql in the Supabase SQL Editor.
          </p>
        ) : all.length === 0 ? (
          <div className="st-empty">
            <h3>No projects yet</h3>
            <p>Create an original or start a partnership. Each one becomes its own project here.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="st-empty">
            <p>No {filter === "original" ? "originals" : "partnerships"} yet.</p>
          </div>
        ) : (
          <div className="st-table" role="list">
            <div className="st-row st-row-head" aria-hidden="true">
              <span>Project</span><span>Type</span><span>Status</span><span className="st-date">Created</span>
            </div>
            {shown.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
