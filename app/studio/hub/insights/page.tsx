import type { Metadata } from "next";
import Link from "next/link";
import { FollowerChart } from "@/components/studio/hub/FollowerChart";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ range?: string; metric?: string }> }) {
  const { range, metric: rawMetric } = await searchParams;
  const metric = rawMetric === "views" || rawMetric === "sales" || rawMetric === "profile" ? rawMetric : "followers";
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
  const followerDays = [...buckets.entries()].map(([date, count]) => ({ date, count }));
  // Views and sales per day (from the database), for the other charts and tiles.
  const { data: statRows } = await supabase.rpc("my_daily_stats", { since: since.toISOString().slice(0, 10) });
  const stats = ((statRows ?? []) as { day: string; listing_views: number; profile_views: number; sales: number | string }[]);
  const sum = (k: "listing_views" | "profile_views" | "sales") => stats.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const series = (k: "listing_views" | "profile_views" | "sales") => stats.slice(-daysBack).map((r) => ({ date: String(r.day).slice(0, 10), count: Number(r[k] ?? 0) }));
  const charts = {
    followers: { title: "New followers", days: followerDays, unit: ["new follower", "new followers"] as [string, string], money: false },
    views: { title: "Listing views", days: series("listing_views"), unit: ["view", "views"] as [string, string], money: false },
    profile: { title: "Profile views", days: series("profile_views"), unit: ["view", "views"] as [string, string], money: false },
    sales: { title: "Sales agreed", days: series("sales"), unit: ["", ""] as [string, string], money: true },
  };
  const chart = charts[metric];
  const metricHref = (m: string) => {
    const p = new URLSearchParams();
    if (daysBack !== 30) p.set("range", String(daysBack));
    if (m !== "followers") p.set("metric", m);
    const str = p.toString();
    return `/studio/hub/insights${str ? `?${str}` : ""}`;
  };
  const updated = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const tiles = [
    { label: "Followers", value: total, note: "All time" },
    { label: "New followers", value: recentRows.length, note: `Past ${daysBack} days` },
    { label: "Posts published", value: posts, note: `Past ${daysBack} days` },
    { label: "Listing views", value: sum("listing_views"), note: `Past ${daysBack} days` },
    { label: "Profile views", value: sum("profile_views"), note: `Past ${daysBack} days` },
    { label: "Sales agreed", value: sum("sales"), note: `Past ${daysBack} days`, money: true },
    { label: "Messages received", value: messages, note: `Past ${daysBack} days` },
    { label: "Live listings", value: listings, note: "Right now" },
  ] as { label: string; value: number; note: string; money?: boolean }[];

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Insights</h1><p className="st-sub">How your community is growing.</p></div>
      </div>
      <div className="hub-toolbar hub-toolbar-split">
        <nav className="st-tabs" aria-label="Time range">
          {[7, 30, 90].map((n) => (
            <Link key={n} href={`/studio/hub/insights?${new URLSearchParams({ ...(n !== 30 ? { range: String(n) } : {}), ...(metric !== "followers" ? { metric } : {}) })}`.replace(/\?$/, "")} aria-current={daysBack === n ? "page" : undefined}>Past {n} days</Link>
          ))}
        </nav>
        <span className="st-help">Last updated at {updated}</span>
      </div>
      <div className="hub-stats">
        {tiles.map((t) => (
          <div key={t.label} className="hub-stat">
            <span>{t.label}</span>
            <b>{t.money ? t.value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : t.value.toLocaleString()}</b>
            <small>{t.note}</small>
          </div>
        ))}
      </div>
      <section className="panel" aria-labelledby="chart-title">
        <div className="hub-panel-head">
          <h2 id="chart-title">{chart.title}</h2>
          <nav className="st-tabs" aria-label="Chart">
            {(["followers", "views", "profile", "sales"] as const).map((m) => (
              <Link key={m} href={metricHref(m)} aria-current={metric === m ? "page" : undefined}>{charts[m].title}</Link>
            ))}
          </nav>
        </div>
        <FollowerChart days={chart.days} label={chart.title} unit={chart.unit} money={chart.money} />
      </section>
    </div>
  );
}
