/*
 * Connecting accounts: the sign-in URL for each platform, swapping the returned code for
 * tokens and account details, and refreshing tokens before they expire.
 */
import type { Platform } from "./platforms";
import { call, form, GRAPH_VERSION, qs } from "./http";
import { SocialError, type SocialEnv } from "./secure";

export type Tokens = { token: string; refresh?: string | null; expiresAt?: Date | null };
export type FacebookPage = { id: string; name: string; avatar: string | null; token: string };
export type Connected = {
  externalId: string; name: string | null; handle: string | null; avatar: string | null;
  tokens: Tokens;
  pages?: FacebookPage[];   // Facebook: every Page granted; the first is used until someone picks another
};

const SCOPES: Record<Platform, string> = {
  instagram: "instagram_business_basic,instagram_business_content_publish",
  facebook: "pages_show_list,pages_manage_posts,pages_read_engagement",
  youtube: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  tiktok: "user.info.basic,user.info.profile,video.publish",
};

const inSeconds = (env: SocialEnv, s: unknown) =>
  typeof s === "number" || (typeof s === "string" && /^\d+$/.test(s)) ? new Date((env.now?.() ?? Date.now()) + Number(s) * 1000) : null;

export function authorizeUrl(env: SocialEnv, p: Platform, redirect: string, state: string) {
  switch (p) {
    case "instagram":
      return `https://www.instagram.com/oauth/authorize?${qs({ client_id: env.instagram?.appId, redirect_uri: redirect, response_type: "code", scope: SCOPES.instagram, state })}`;
    case "facebook":
      return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs({ client_id: env.meta?.appId, redirect_uri: redirect, response_type: "code", scope: SCOPES.facebook, state })}`;
    case "youtube":
      return `https://accounts.google.com/o/oauth2/v2/auth?${qs({
        client_id: env.google?.clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES.youtube,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
      })}`;
    case "tiktok":
      return `https://www.tiktok.com/v2/auth/authorize/?${qs({ client_key: env.tiktok?.clientKey, redirect_uri: redirect, response_type: "code", scope: SCOPES.tiktok, state })}`;
  }
}

/** Swaps the sign-in code for long-lived tokens and the account's details. */
export async function exchangeCode(env: SocialEnv, p: Platform, code: string, redirect: string): Promise<Connected> {
  if (p === "instagram") {
    const short = await call(env, "Instagram", "https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form({ client_id: env.instagram?.appId, client_secret: env.instagram?.appSecret, grant_type: "authorization_code", redirect_uri: redirect, code }),
    });
    const first = (Array.isArray(short.data) ? short.data[0] : short) as Record<string, unknown>;
    const long = await call(env, "Instagram", `https://graph.instagram.com/access_token?${qs({
      grant_type: "ig_exchange_token", client_secret: env.instagram?.appSecret, access_token: String(first.access_token),
    })}`);
    const token = String(long.access_token);
    const me = await call(env, "Instagram", `https://graph.instagram.com/${GRAPH_VERSION}/me?${qs({ fields: "user_id,username,name,profile_picture_url", access_token: token })}`);
    return {
      externalId: String(me.user_id ?? me.id ?? first.user_id), name: (me.name as string) || null, handle: (me.username as string) || null,
      avatar: (me.profile_picture_url as string) || null, tokens: { token, expiresAt: inSeconds(env, long.expires_in) },
    };
  }

  if (p === "facebook") {
    const short = await call(env, "Facebook", `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${qs({
      client_id: env.meta?.appId, client_secret: env.meta?.appSecret, redirect_uri: redirect, code,
    })}`);
    const long = await call(env, "Facebook", `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${qs({
      grant_type: "fb_exchange_token", client_id: env.meta?.appId, client_secret: env.meta?.appSecret, fb_exchange_token: String(short.access_token),
    })}`);
    const res = await call(env, "Facebook", `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${qs({
      fields: "id,name,access_token,picture{url}", limit: 100, access_token: String(long.access_token),
    })}`);
    const pages = ((res.data ?? []) as Record<string, unknown>[])
      .filter((x) => x.id && x.access_token)
      .map((x) => ({
        id: String(x.id), name: String(x.name ?? "Page"), token: String(x.access_token),
        avatar: ((x.picture as { data?: { url?: string } } | undefined)?.data?.url) ?? null,
      }));
    if (!pages.length) throw new SocialError("No Facebook Pages came through. Pick at least one Page when Facebook asks, or create a Page first.");
    const pg = pages[0];
    // Page tokens made from a long-lived user token don't expire.
    return { externalId: pg.id, name: pg.name, handle: null, avatar: pg.avatar, tokens: { token: pg.token, expiresAt: null }, pages };
  }

  if (p === "youtube") {
    const t = await call(env, "Google", "https://oauth2.googleapis.com/token", {
      method: "POST",
      body: form({ code, client_id: env.google?.clientId, client_secret: env.google?.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    });
    const token = String(t.access_token);
    const ch = await call(env, "YouTube", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` } });
    const c = ((ch.items ?? []) as Record<string, unknown>[])[0];
    if (!c) throw new SocialError("That Google account doesn’t have a YouTube channel yet. Create one on YouTube, then connect again.");
    const sn = (c.snippet ?? {}) as { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
    if (!t.refresh_token) throw new SocialError("Google didn’t grant offline access. Remove tsayvish from your Google account’s third-party access, then connect again.");
    return {
      externalId: String(c.id), name: sn.title ?? null, handle: sn.customUrl ?? null, avatar: sn.thumbnails?.default?.url ?? null,
      tokens: { token, refresh: String(t.refresh_token), expiresAt: inSeconds(env, t.expires_in) },
    };
  }

  const t = await call(env, "TikTok", "https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_key: env.tiktok?.clientKey, client_secret: env.tiktok?.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirect }),
  });
  if (!String(t.scope ?? "").includes("video.publish")) throw new SocialError("TikTok didn’t grant permission to post. Connect again and allow posting.");
  const token = String(t.access_token);
  const u = await call(env, "TikTok", "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = ((u.data as { user?: Record<string, string> } | undefined)?.user ?? {}) as Record<string, string>;
  return {
    externalId: String(user.open_id ?? t.open_id), name: user.display_name ?? null, handle: user.username ? `@${user.username}` : null,
    avatar: user.avatar_url ?? null, tokens: { token, refresh: String(t.refresh_token), expiresAt: inSeconds(env, t.expires_in) },
  };
}

/** How long before expiry to refresh. Instagram tokens last 60 days; Google and TikTok about a day or less. */
const REFRESH_AHEAD_MS: Record<Platform, number> = { instagram: 7 * 864e5, facebook: 0, youtube: 5 * 60_000, tiktok: 30 * 60_000 };

export function needsRefresh(env: SocialEnv, p: Platform, expiresAt: string | Date | null | undefined) {
  if (!expiresAt || p === "facebook") return false;
  return new Date(expiresAt).getTime() - (env.now?.() ?? Date.now()) < REFRESH_AHEAD_MS[p];
}

/** Gets fresh tokens. Throws SocialError with reconnect=true if the person has to sign in again. */
export async function refreshTokens(env: SocialEnv, p: Platform, current: Tokens): Promise<Tokens> {
  try {
    if (p === "instagram") {
      const r = await call(env, "Instagram", `https://graph.instagram.com/refresh_access_token?${qs({ grant_type: "ig_refresh_token", access_token: current.token })}`);
      return { token: String(r.access_token), expiresAt: inSeconds(env, r.expires_in) };
    }
    if (p === "youtube") {
      if (!current.refresh) throw new SocialError("Reconnect YouTube.", { reconnect: true });
      const r = await call(env, "Google", "https://oauth2.googleapis.com/token", {
        method: "POST",
        body: form({ client_id: env.google?.clientId, client_secret: env.google?.clientSecret, refresh_token: current.refresh, grant_type: "refresh_token" }),
      });
      return { token: String(r.access_token), refresh: (r.refresh_token as string) || current.refresh, expiresAt: inSeconds(env, r.expires_in) };
    }
    if (p === "tiktok") {
      if (!current.refresh) throw new SocialError("Reconnect TikTok.", { reconnect: true });
      const r = await call(env, "TikTok", "https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ client_key: env.tiktok?.clientKey, client_secret: env.tiktok?.clientSecret, grant_type: "refresh_token", refresh_token: current.refresh }),
      });
      return { token: String(r.access_token), refresh: String(r.refresh_token || current.refresh), expiresAt: inSeconds(env, r.expires_in) };
    }
    return current;
  } catch (e) {
    if (e instanceof SocialError && !e.retry) throw new SocialError(e.message, { reconnect: true });
    throw e;
  }
}
