import type { Metadata } from "next";
import Link from "next/link";
import { FollowerChart } from "@/components/studio/hub/FollowerChart";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const daysBack = range === "90" ? 90 : range === "7" ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 864e5);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [total, recentRows, posts, messages, listings] = await Promise.all([
    count(supabase.from("follows").select("creator_id", { count: "exact", head: true }).eq("creator_id", me)),
    supabase.from("follows").select("created_at").eq("creator_id", me).gte("created_at", sinceIso).then((r) => (r.data ?? []) as { created_at: string }[]),
    count(supabase.from("posts").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("status", "published").gte("published_at", sinceIso)),
    count(supabase.from("messages").select("id", { count: "exact", head: true }).neq("sender_id", me).gte("created_at", sinceIso)),
    count(supabase.from("listings").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("status", "published")),
  ]);

  // One bucket per day, oldest first.
  const buckets = new Map<string, number>();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(since.getTime() + i * 864e5);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  recentRows.forEach((r) => {
    const k = new Date(r.created_at).toISOString().slice(0, 10);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  });
  const days = [...buckets.entries()].map(([date, count]) => ({ date, count }));
  const updated = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const tiles = [
    { label: "Followers", value: total, note: "All time" },
    { label: "New followers", value: recentRows.length, note: `Past ${daysBack} days` },
    { label: "Posts published", value: posts, note: `Past ${daysBack} days` },
    { label: "Messages received", value: messages, note: `Past ${daysBack} days` },
    { label: "Live listings", value: listings, note: "Right now" },
  ];

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Insights</h1><p className="st-sub">How your community is growing.</p></div>
      </div>
      <div className="hub-toolbar hub-toolbar-split">
        <nav className="st-tabs" aria-label="Time range">
          {[7, 30, 90].map((n) => (
            <Link key={n} href={n === 30 ? "/studio/hub/insights" : `/studio/hub/insights?range=${n}`} aria-current={daysBack === n ? "page" : undefined}>Past {n} days</Link>
          ))}
        </nav>
        <span className="st-help">Last updated at {updated}</span>
      </div>
      <div className="hub-stats">
        {tiles.map((t) => (
          <div key={t.label} className="hub-stat">
            <span>{t.label}</span>
            <b>{t.value.toLocaleString()}</b>
            <small>{t.note}</small>
          </div>
        ))}
      </div>
      <section className="panel" aria-labelledby="chart-title">
        <div className="hub-panel-head"><h2 id="chart-title">New followers</h2><span className="st-help">Daily</span></div>
        <FollowerChart days={days} />
      </section>
    </div>
  );
}
