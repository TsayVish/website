import type { CastMember } from "@/lib/content";

/** A cast member's finished render. Sized by its container. */
export function CastArt({ member, eager = false }: { member: CastMember; eager?: boolean }) {
  return (
    <img
      className="cast-img"
      src={member.image}
      alt={`${member.name}, a ${member.species.toLowerCase()} from the tsayvish cast`}
      width={800}
      height={800}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
