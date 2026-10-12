import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/social/oauth";
import { platformReady, newNonce, redirectUri, signState, socialEnv } from "@/lib/social/secure";
import { isPlatform } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

// Starts connecting a platform account to a character: sends the person to the platform's sign-in.
export async function GET(request: NextRequest, { params }: Ctx) {
  const { platform } = await params;
  const project = request.nextUrl.searchParams.get("project") ?? "";
  const back = (msg: string) => NextResponse.redirect(new URL(`/studio/p/${encodeURIComponent(project)}/social?social_error=${encodeURIComponent(msg)}`, request.url));
  if (!isPlatform(platform) || !/^[0-9a-f-]{36}$/i.test(project)) return NextResponse.redirect(new URL("/studio", request.url));
  const env = socialEnv();
  if (!platformReady(env, platform)) return back("That platform isn’t set up yet.");

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?mode=login", request.url));
  const { data: canEdit } = await db.rpc("can_edit_project", { pid: project });
  if (canEdit !== true) return back("Only the character’s owner or editors can connect accounts.");

  const nonce = newNonce();
  const state = signState(env, { u: user.id, p: project, pl: platform, n: nonce });
  const res = NextResponse.redirect(authorizeUrl(env, platform, redirectUri(env, request.nextUrl.origin, platform), state));
  res.cookies.set("social_nonce", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/social", maxAge: 900 });
  return res;
}
