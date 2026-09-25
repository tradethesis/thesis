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
  /*
   * The path, forwarded as a header.
   *
   * A server layout cannot read the URL it is rendering, and /app has to redirect an unsigned
   * visitor back to the entry screen carrying where they were going. Doing it here keeps the
   * session check itself on the server — the middleware only copies a string and never touches
   * the database, which is not a thing to do at the edge.
   */
  const withPath = new Headers(request.headers);
  withPath.set("x-thesis-pathname", request.nextUrl.pathname);
  const pass = () => NextResponse.next({ request: { headers: withPath } });

  if (siteMode() !== "waitlist") return pass();
  if (!isGatedPath(request.nextUrl.pathname)) return pass();

  const url = request.nextUrl.clone();
  url.pathname = "/join";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except the API, Next's own assets, and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand|.*\\.[\\w]+$).*)"],
};
