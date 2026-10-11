import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie on every matched request and
 * guards the Studio: logged-out visitors go to /login, logged-in visitors skip /login.
 */
export async function updateSession(request: NextRequest) {
  // If Supabase sends a login code to a page other than /auth/callback (for example the
  // home page, when the redirect URL isn't on Supabase's allow list), finish the login anyway.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const finish = request.nextUrl.clone();
    finish.pathname = "/auth/callback";
    finish.search = `?code=${encodeURIComponent(code)}&next=/studio`;
    return NextResponse.redirect(finish);
  }

  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Don't put code between createServerClient and getUser: it keeps the session fresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  let redirectTo: URL | null = null;

  if (!user && path.startsWith("/studio")) {
    redirectTo = request.nextUrl.clone();
    redirectTo.pathname = "/login";
    redirectTo.search = `?mode=login&next=${encodeURIComponent(path)}`;
  } else if (user && path === "/login") {
    redirectTo = request.nextUrl.clone();
    redirectTo.pathname = "/studio";
    redirectTo.search = "";
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
