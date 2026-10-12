import Link from "next/link";
import { fmtDate } from "@/lib/hub";
import { ROLE_LABEL, type OrgSummary } from "@/lib/orgs";
import { CreateOrg } from "./CreateOrg";

/** The orgs page: your orgs, and (for admins) a way to start one. */
export function OrgList({ orgs, staff, base }: { orgs: OrgSummary[]; staff: boolean; base: string }) {
  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <h1>Orgs</h1>
          <p className="st-sub">
            {staff
              ? "Admins only see and manage people who share an org with them: their characters, credits, requests and reports. Everyone else stays private to you."
              : "The teams you belong to. Admins in your org can help with your account, characters and requests."}
          </p>
        </div>
      </div>
      {staff && <CreateOrg base={base} />}
      {orgs.length === 0 ? (
        <div className="st-empty">
          <b>{staff ? "You’re not in any orgs yet" : "You’re not in an org"}</b>
          <p>{staff ? "Create an org, then add people by email. Until then, admin pages only show you." : "When an admin adds you to an org, it shows up here."}</p>
        </div>
      ) : (
        <div className="st-table org-table">
          <div className="st-row st-row-head org-row" aria-hidden="true"><span>Org</span><span>Members</span><span>Your role</span><span>Created</span></div>
          {orgs.map((o) => (
            <Link key={o.id} href={`${base}/${o.id}`} className="st-row org-row">
              <b className="org-name">{o.name}</b>
              <span className="st-cell">{o.members} {o.members === 1 ? "person" : "people"}</span>
              <span className="st-cell">{ROLE_LABEL[o.role]}</span>
              <span className="st-cell st-date">{fmtDate(o.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
