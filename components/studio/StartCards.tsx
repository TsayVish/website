import Link from "next/link";
import { IconHandshake, IconSpark } from "./icons";

/** The two ways to start a project. Partners see the partnership option first. */
export function StartCards({ partnerFirst = false }: { partnerFirst?: boolean }) {
  const original = (
    <Link key="o" href="/studio/new/original" className="st-start yours">
      <span className="st-start-icon"><IconSpark /></span>
      <b>Create an original</b>
      <p>Design a character of your own, then switch on trademark, storefront, payments and more.</p>
      <span className="st-start-cta">Start an original →</span>
    </Link>
  );
  const partner = (
    <Link key="p" href="/studio/new/partner" className="st-start ours">
      <span className="st-start-icon"><IconHandshake /></span>
      <b>Partner with tsayvish</b>
      <p>Brand partnerships, licensing and manufacturing with characters from the tsayvish cast.</p>
      <span className="st-start-cta">Start a partnership →</span>
    </Link>
  );
  return <div className="st-starts">{partnerFirst ? [partner, original] : [original, partner]}</div>;
}
