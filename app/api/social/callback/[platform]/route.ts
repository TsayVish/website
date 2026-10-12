import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/social/oauth";
import { PLATFORM_INFO } from "@/lib/social/platforms";
import { readState, redirectUri, seal, SocialError, socialEnv } from "@/lib/social/secure";
import { isPlatform } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ platform: string }> };

// The platform sends people back here after they sign in. Saves the connection, then returns to the Social page.
export async function GET(request: NextRequest, { params }: Ctx) {
  const { platform } = await params;
  const sp = request.nextUrl.searchParams;
  const env = socialEnv();
  let project = "";
  const to = (q: string) => {
    const res = NextResponse.redirect(new URL(project ? `/studio/p/${project}/social?${q}` : "/studio", request.url));
    res.cookies.set("social_nonce", "", { path: "/api/social", maxAge: 0 });
    return res;
  };
  try {
    if (!isPlatform(platform)) throw new SocialError("Unknown platform.");
    const state = readState(env, sp.get("state"));
    project = state.p;
    if (state.pl !== platform || state.n !== request.cookies.get("social_nonce")?.value) throw new SocialError("That sign-in didn’t match. Try connecting again.");
    const denied = sp.get("error_description") || sp.get("error_reason") || sp.get("error");
    if (denied || !sp.get("code")) throw new SocialError(`${PLATFORM_INFO[platform].label} wasn’t connected${denied ? `: ${denied}` : "."}`);

    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user || user.id !== state.u) throw new SocialError("You were signed out. Log in and connect again.");

    const acct = await exchangeCode(env, platform, sp.get("code")!, redirectUri(env, request.nextUrl.origin, platform));
    const { error } = await db.rpc("social_save_account", {
      p_project: project, p_platform: platform, p_external_id: acct.externalId, p_name: acct.name, p_handle: acct.handle, p_avatar: acct.avatar,
      p_token_enc: seal(env, acct.tokens.token), p_refresh_enc: acct.tokens.refresh ? seal(env, acct.tokens.refresh) : null,
      p_expires_at: acct.tokens.expiresAt?.toISOString() ?? null,
      p_choices_enc: acct.pages && acct.pages.length > 1 ? seal(env, JSON.stringify(acct.pages)) : null,
    });
    if (error) throw new SocialError(error.message);
    return to(`connected=${platform}`);
  } catch (e) {
    if (!(e instanceof SocialError)) console.error("[social] callback", e);
    return to(`social_error=${encodeURIComponent(e instanceof SocialError ? e.message : "Couldn’t connect. Try again.")}`);
  }
}
