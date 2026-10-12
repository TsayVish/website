import { PLATFORM_INFO, type Platform } from "@/lib/social/platforms";

const MARK: Record<Platform, string> = { instagram: "IG", facebook: "f", youtube: "▶", tiktok: "♪" };

/** Small platform badges. */
export function Marks({ platforms }: { platforms: Platform[] }) {
  if (!platforms.length) return null;
  return (
    <span className="cm-marks" aria-label={platforms.map((p) => PLATFORM_INFO[p].label).join(", ")}>
      {platforms.map((p) => <span key={p} className={`so-mark so-${p}`} aria-hidden="true">{MARK[p]}</span>)}
    </span>
  );
}
