import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/app/AppNav";
import { ThesisDrawer } from "@/components/thesis/ThesisDrawer";
import { getSession } from "@/server/session";

import "./shell.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The workspace shell.
 *
 * It used to render a full-width treemap above three columns, with a left rail of movers and a
 * right rail of your purchases — and it fetched all of that here, in three sequential round
 * trips, before any page under /app could render. The terminal supersedes every one of those
 * surfaces: the basket leaderboard is the left column, the selected basket is the middle, and
 * traders are the right. So the shell is now navigation and a full-width main, and the queries
 * are gone with the rails that needed them.
 *
 * ## The gate
 *
 * Past this point everything is signed in. `getSession()` reads the cookie and checks it against
 * the database, so this is a real check rather than a client boolean — nothing here trusts
 * localStorage, and nothing authorises a write.
 *
 * The path comes from a header the middleware sets, because a layout cannot otherwise know the
 * URL it is rendering. It is handed to the entry screen at /connect as `?next=` so somebody who followed a
 * deep link lands where they were going rather than at the top.
 *
 * `.landing` stays on the wrapper. It is not a theme name — it carries the box-sizing, margin and
 * focus resets every component below depends on. What it also carries is
 * `.landing a:not(.ln-btn):not(.ln-wordmark) { color: accent }` at (0,3,1), which app.css already
 * fights in four places. terminal.css beats it by matching that specificity and arriving later in
 * the cascade rather than by escalating, which is how those four workarounds started.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    const path = (await headers()).get("x-thesis-pathname") ?? "/app";
    redirect(`/connect?next=${encodeURIComponent(path)}`);
  }

  return (
    <div className="landing tm-shell">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <AppNav wallet={session.wallet} />
      {/*
        The measure and the bottom clearance live here, not on each page. The old shell provided
        them through `.app-main`; stripping it left three routes flush against both screen edges
        with the fixed nav bar over their last control.
      */}
      <main id="main" className="tm-page">
        {children}
      </main>
      {/* Mounted once. Every trigger dispatches an event rather than rendering its own dialog. */}
      <ThesisDrawer />
    </div>
  );
}
