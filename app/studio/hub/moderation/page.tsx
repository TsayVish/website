import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { ReportActions } from "@/components/studio/hub/SmallActions";
import { IconShield } from "@/components/studio/icons";
import { fmtDate, reportHref, type ReportRow } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };

const TYPE_LABEL = { profile: "Profile", listing: "Listing", post: "Post", message: "Message" } as const;
const STATUS_LABEL = { open: "Open", resolved: "Resolved", dismissed: "Dismissed" } as const;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "mine" ? "mine" : "reported";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: aboutMe, error }, { data: mine }] = await Promise.all([
    supabase.rpc("reports_about_me"),
    supabase.from("reports").select("id, target_type, target_id, target_label, reason, details, status, created_at").eq("reporter_id", user!.id).order("created_at", { ascending: false }),
  ]);
  const reported = (aboutMe ?? []) as ReportRow[];
  const filed = (mine ?? []) as ReportRow[];
  const rows = tab === "mine" ? filed : reported;
  const open = reported.filter((r) => r.status === "open").length;

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Moderation</h1><p className="st-sub">Reports about your content, and reports you’ve made.</p></div></div>
      <HubTabs current={tab} tabs={[
        { key: "reported", label: "Reported content", href: "/studio/hub/moderation", count: open },
        { key: "mine", label: "My reports", href: "/studio/hub/moderation?tab=mine", count: filed.length },
      ]} />
      {error && <p className="form-error" role="alert">Couldn’t load reports: {error.message}. Run the latest supabase/schema.sql.</p>}
      {rows.length === 0 ? (
        <EmptyState icon={<IconShield />} title={tab === "mine" ? "You haven’t reported anything" : "Nothing to moderate"}>
          {tab === "mine"
            ? "If something on tsayvish looks wrong, use Report on the profile, listing, post or chat."
            : "When someone reports your profile, listings, posts or messages, it shows up here so you can review it. Our team sees every report too."}
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className={`st-row st-row-head hub-rep-row${tab === "mine" ? " hub-rep-mine" : ""}`} aria-hidden="true">
            <span>Item</span><span>Reason</span><span>Status</span><span>Reported</span>{tab === "reported" && <span />}
          </div>
          {rows.map((r) => {
            const href = reportHref(r);
            return (
              <div key={r.id} className={`st-row hub-rep-row${tab === "mine" ? " hub-rep-mine" : ""}`}>
                <span className="st-proj-text">
                  {href ? <Link href={href}><b>{r.target_label || TYPE_LABEL[r.target_type]}</b></Link> : <b>{r.target_label || TYPE_LABEL[r.target_type]}</b>}
                  <small>{TYPE_LABEL[r.target_type]}{r.details ? ` · “${r.details}”` : ""}</small>
                </span>
                <span className="st-cell">{r.reason}</span>
                <span><span className={`st-status ${r.status === "open" ? "requested" : r.status === "resolved" ? "active" : "off"}`}>{STATUS_LABEL[r.status]}</span></span>
                <span className="st-cell">{fmtDate(r.created_at)}</span>
                {tab === "reported" && <ReportActions reportId={r.id} status={r.status} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
