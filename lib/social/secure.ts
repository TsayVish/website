/*
 * Server-only settings, token encryption and signed OAuth state for social publishing.
 * None of these values may be NEXT_PUBLIC_ variables.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Platform } from "./platforms";

export type SocialEnv = {
  tokenKey?: string;     // SOCIAL_TOKEN_KEY: any long random string; encrypts tokens at rest
  dbSecret?: string;     // BILLING_DB_SECRET: the server secret the database checks
  cronSecret?: string;   // CRON_SECRET: protects the scheduled publisher
  siteUrl?: string;      // NEXT_PUBLIC_SITE_URL: used to build OAuth redirect URLs
  meta?: { appId?: string; appSecret?: string };           // Facebook Pages
  instagram?: { appId?: string; appSecret?: string };      // Instagram (Business Login)
  google?: { clientId?: string; clientSecret?: string };   // YouTube
  tiktok?: { clientKey?: string; clientSecret?: string };
  fetch?: typeof fetch;
  now?: () => number;
};

export function socialEnv(): SocialEnv {
  const v = (x: string | undefined) => x || undefined;
  return {
    tokenKey: v(process.env.SOCIAL_TOKEN_KEY),
    dbSecret: v(process.env.BILLING_DB_SECRET),
    cronSecret: v(process.env.CRON_SECRET),
    siteUrl: v((process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "")),
    meta: { appId: v(process.env.META_APP_ID), appSecret: v(process.env.META_APP_SECRET) },
    instagram: { appId: v(process.env.INSTAGRAM_APP_ID), appSecret: v(process.env.INSTAGRAM_APP_SECRET) },
    google: { clientId: v(process.env.GOOGLE_CLIENT_ID), clientSecret: v(process.env.GOOGLE_CLIENT_SECRET) },
    tiktok: { clientKey: v(process.env.TIKTOK_CLIENT_KEY), clientSecret: v(process.env.TIKTOK_CLIENT_SECRET) },
  };
}

/** Is everything needed to connect and post to this platform set? */
export function platformReady(env: SocialEnv, p: Platform) {
  if (!env.tokenKey || !env.dbSecret) return false;
  if (p === "facebook") return Boolean(env.meta?.appId && env.meta?.appSecret);
  if (p === "instagram") return Boolean(env.instagram?.appId && env.instagram?.appSecret);
  if (p === "youtube") return Boolean(env.google?.clientId && env.google?.clientSecret);
  return Boolean(env.tiktok?.clientKey && env.tiktok?.clientSecret);
}

export class SocialError extends Error {
  status: number;
  reconnect: boolean;
  retry: boolean;
  constructor(message: string, opts: { status?: number; reconnect?: boolean; retry?: boolean } = {}) {
    super(message);
    this.status = opts.status ?? 400;
    this.reconnect = opts.reconnect ?? false;
    this.retry = opts.retry ?? false;
  }
}

const keyFor = (env: SocialEnv, purpose: string) => {
  if (!env.tokenKey || env.tokenKey.length < 16) throw new SocialError("Social posting isn’t set up yet (SOCIAL_TOKEN_KEY).", { status: 503 });
  return createHash("sha256").update(`${purpose}:${env.tokenKey}`).digest();
};
const b64 = (b: Buffer) => b.toString("base64url");

/** AES-256-GCM. Output: "v1." + base64url(iv | tag | ciphertext). */
export function seal(env: SocialEnv, text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(env, "tokens"), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${b64(Buffer.concat([iv, c.getAuthTag(), ct]))}`;
}

export function unseal(env: SocialEnv, sealed: string | null | undefined) {
  if (!sealed) return null;
  if (!sealed.startsWith("v1.")) throw new SocialError("Saved sign-in is unreadable. Reconnect the account.", { reconnect: true });
  const raw = Buffer.from(sealed.slice(3), "base64url");
  try {
    const d = createDecipheriv("aes-256-gcm", keyFor(env, "tokens"), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new SocialError("Saved sign-in is unreadable (was SOCIAL_TOKEN_KEY changed?). Reconnect the account.", { reconnect: true });
  }
}

export type OAuthState = { u: string; p: string; pl: Platform; n: string; e: number };

/** Signed, expiring state for the OAuth round trip. */
export function signState(env: SocialEnv, s: Omit<OAuthState, "e">, ttlMs = 15 * 60_000) {
  const body = b64(Buffer.from(JSON.stringify({ ...s, e: (env.now?.() ?? Date.now()) + ttlMs })));
  return `${body}.${b64(createHmac("sha256", keyFor(env, "state")).update(body).digest())}`;
}

export function readState(env: SocialEnv, value: string | null | undefined): OAuthState {
  const [body, sig] = String(value ?? "").split(".");
  if (!body || !sig) throw new SocialError("That sign-in link isn’t valid. Try connecting again.");
  const want = createHmac("sha256", keyFor(env, "state")).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new SocialError("That sign-in link isn’t valid. Try connecting again.");
  const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (s.e < (env.now?.() ?? Date.now())) throw new SocialError("That sign-in took too long. Try connecting again.");
  return s;
}

export const newNonce = () => b64(randomBytes(16));

/** Constant-time check of "Authorization: Bearer <secret>". */
export function bearerOk(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function redirectUri(env: SocialEnv, origin: string, p: Platform) {
  return `${env.siteUrl || origin.replace(/\/+$/, "")}/api/social/callback/${p}`;
}
