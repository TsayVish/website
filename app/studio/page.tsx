import Link from "next/link";
import { CharacterArt } from "@/components/art";
import { ProjectCard } from "@/components/studio/ProjectCard";
import { StartCards } from "@/components/studio/StartCards";
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
      <div className="st-hello">
        <span className="eyebrow">Studio</span>
        <h1>{firstName ? `Hi ${firstName}.` : "Welcome."} What are we making?</h1>
      </div>

      <StartCards partnerFirst={p?.goal === "partner"} />

      <div className="st-section">
        <div className="st-section-head">
          <h2>Your projects</h2>
          {all.length > 0 && (
            <nav className="st-filters" aria-label="Filter projects">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/studio" : `/studio?type=${f.key}`}
                  className="chip"
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
            <div className="st-empty-art" aria-hidden="true">
              <CharacterArt name="Empty" kind="Creature" color="var(--lilac)" prop="sparkle" />
            </div>
            <div>
              <h3>No projects yet</h3>
              <p>Pick one of the two options above to start. Every original and every partnership becomes its own project here.</p>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="st-muted">No {filter === "original" ? "originals" : "partnerships"} yet.</p>
        ) : (
          <div className="st-grid">
            {shown.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
