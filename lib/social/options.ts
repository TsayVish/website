import { PLATFORMS, type Platform, type PostOptions, type TikTokPrivacy } from "./platforms";

const TIKTOK_PRIVACY: TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

/** Keeps only known option fields with the right types. */
export function cleanOptions(o: unknown): PostOptions {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, Record<string, unknown> | unknown>;
  const yt = (x.youtube ?? {}) as Record<string, unknown>;
  const tt = (x.tiktok ?? {}) as Record<string, unknown>;
  const caps = (x.captions ?? {}) as Record<string, unknown>;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const captions: Partial<Record<Platform, string>> = {};
  for (const p of PLATFORMS) if (typeof caps[p] === "string" && (caps[p] as string).trim()) captions[p] = (caps[p] as string).slice(0, 5000);
  return {
    aiGenerated: x.aiGenerated !== false,
    youtube: {
      privacy: (["public", "unlisted", "private"] as const).find((v) => v === yt.privacy) ?? "public",
      madeForKids: bool(yt.madeForKids) ?? false,
    },
    tiktok: {
      privacy: TIKTOK_PRIVACY.find((v) => v === tt.privacy),
      allowComments: bool(tt.allowComments) ?? true, allowDuet: bool(tt.allowDuet) ?? true, allowStitch: bool(tt.allowStitch) ?? true,
      brandOwn: bool(tt.brandOwn) ?? false, brandPaid: bool(tt.brandPaid) ?? false,
    },
    ...(Object.keys(captions).length ? { captions } : {}),
  };
}
