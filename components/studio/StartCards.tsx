import Link from "next/link";
import { CharacterArt, Critter } from "@/components/art";
import { CAST } from "@/lib/content";

/** The two ways to start a project. Partners see the partnership card first. */
export function StartCards({ partnerFirst = false }: { partnerFirst?: boolean }) {
  const original = (
    <Link key="o" href="/studio/new/original" className="st-start yours">
      <div className="st-start-art" aria-hidden="true">
        <CharacterArt name="New character" kind="Robot" color="var(--butter)" prop="sparkle" />
      </div>
      <div>
        <span className="eyebrow">Create an original</span>
        <h2>Build a character of your own</h2>
        <p>Design any kind of character, then switch on trademark, storefront, payments and more.</p>
      </div>
      <span className="st-start-cta">Start an original →</span>
    </Link>
  );
  const partner = (
    <Link key="p" href="/studio/new/partner" className="st-start ours">
      <div className="st-start-art" aria-hidden="true">
        <Critter {...CAST[0]} />
      </div>
      <div>
        <span className="eyebrow">Partner with tsayvish</span>
        <h2>Work with our cast</h2>
        <p>Brand partnerships, licensing and manufacturing with the tsayvish originals.</p>
      </div>
      <span className="st-start-cta">Start a partnership →</span>
    </Link>
  );
  return <div className="st-starts">{partnerFirst ? [partner, original] : [original, partner]}</div>;
}
