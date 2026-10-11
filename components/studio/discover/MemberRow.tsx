import Link from "next/link";
import { Avatar } from "../Avatar";
import type { Member } from "@/lib/members";

/** A creator in a list: photo, name and one line about them. */
export function MemberRow({ member }: { member: Member }) {
  const name = member.full_name || "tsayvish member";
  const line = member.bio || member.location || "Creator on tsayvish";
  return (
    <Link href={`/studio/u/${member.id}`} className="dc-member">
      <Avatar url={member.avatar_url} name={name} size={56} />
      <span className="dc-member-text">
        <b>{name}</b>
        <span>{line}</span>
      </span>
    </Link>
  );
}
