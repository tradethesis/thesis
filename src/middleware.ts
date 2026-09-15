import { NextResponse, type NextRequest } from "next/server";
import { isGatedPath, siteMode } from "@/lib/site-mode";

/**
 * Close the product routes while the site is in waitlist mode.
 *
 * A redirect rather than a 404: the pages exist and work, they are simply not open yet,
 * and sending someone to the front door is more useful than telling them nothing is there.
 * 307 rather than 308 so nothing caches the redirect past the day this opens up.
 *
 * The API is deliberately untouched. /api/waitlist has to work, and the rest already
 * refuses without an authenticated wallet session.
 */
export function middleware(request: NextRequest) {
  if (siteMode() !== "waitlist") return NextResponse.next();
  if (!isGatedPath(request.nextUrl.pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/join";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except the API, Next's own assets, and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand|.*\\.[\\w]+$).*)"],
};
