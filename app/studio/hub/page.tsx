import Link from "next/link";
import { Avatar } from "@/components/studio/Avatar";
import { IconCheck } from "@/components/studio/icons";
import { myProjectsFilter } from "@/lib/mine";
import { createClient } from "@/lib/supabase/server";

export default async function HubDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [{ data: profile }, followers, posts, listings, projects] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, bio").eq("id", me).maybeSingle(),
    count(supabase.from("follows").select("creator_id", { count: "exact", head: true }).eq("creator_id", me)),
    count(supabase.from("posts").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("status", "published")),
    count(supabase.from("listings").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("status", "published")),
    count(supabase.from("projects").select("id", { count: "exact", head: true }).eq("type", "original").or(await myProjectsFilter(supabase, me))),
  ]);
  const p = profile as { full_name: string | null; avatar_url: string | null; bio: string | null } | null;
  const name = p?.full_name || "Your creator page";

  const steps = [
    { done: Boolean(p?.avatar_url && p?.bio), title: "Start with the basics", text: "Add your photo and a short bio so people know what you make.", href: "/studio/settings" },
    { done: projects > 0, title: "Add your first character", text: "Design one from scratch, or upload a character you already run.", href: "/studio/hub/characters/new" },
    { done: posts > 0, title: "Publish your first post", text: "Share an update with everyone, or just with your followers.", href: "/studio/hub/library/new" },
    { done: listings > 0, title: "List on the Marketplace", text: "Offer a character to license or a service you provide.", href: "/studio/marketplace/new" },
    { done: followers > 0, title: "Get your first follower", text: "Share your profile so people can follow your work.", href: `/studio/u/${me}` },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="st-stack">
      <div className="hub-hero">
        <Avatar url={p?.avatar_url} name={name} size={64} />
        <div className="hub-hero-text">
          <h1>{name}</h1>
          <p className="st-muted">{followers} follower{followers === 1 ? "" : "s"} · {posts} post{posts === 1 ? "" : "s"} · {listings} listing{listings === 1 ? "" : "s"}</p>
        </div>
        <div className="st-actions">
          <Link className="btn ghost" href={`/studio/u/${me}`}>View profile</Link>
          <Link className="btn" href="/studio/hub/library/new">Create a post</Link>
        </div>
      </div>

      <section className="panel hub-setup" aria-labelledby="setup-title">
        <div className="hub-setup-head">
          <div>
            <h2 id="setup-title">{doneCount === steps.length ? "You’re all set up" : "Set up your creator page"}</h2>
            <p className="st-muted">{doneCount} of {steps.length} complete</p>
          </div>
          <div className="hub-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>
        <ol className="hub-steps">
          {steps.map((s) => (
            <li key={s.title} className={s.done ? "done" : ""}>
              <Link href={s.href}>
                <span className="hub-step-mark" aria-hidden="true">{s.done ? <IconCheck /> : null}</span>
                <span className="hub-step-text">
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </span>
                <span className="hub-step-go" aria-hidden="true">›</span>
                <span className="visually-hidden">{s.done ? "(done)" : "(to do)"}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="hub-earn" aria-labelledby="earn-title">
        <h2 id="earn-title">Ways to earn</h2>
        <div className="hub-earn-grid">
          <Link href="/studio/marketplace/new" className="panel hub-earn-card">
            <b>License a character</b>
            <span>List an original as available to license, and brands can message you directly.</span>
          </Link>
          <Link href="/studio/projects" className="panel hub-earn-card">
            <b>Open a storefront</b>
            <span>Request Storefront and Payments on an original to sell merch and take payments.</span>
          </Link>
          <Link href="/studio/marketplace/new" className="panel hub-earn-card">
            <b>Sell a service</b>
            <span>Offer illustration, voice, animation or anything else creators need.</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
