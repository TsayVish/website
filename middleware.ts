import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/", "/studio/:path*", "/api/studio/:path*", "/api/billing/checkout", "/api/social/connect/:path*", "/api/social/posts/:path*", "/api/social/posts", "/api/social/accounts/:path*", "/api/ai/:path*", "/login", "/reset-password"],
};
