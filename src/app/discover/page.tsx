import type { Metadata } from "next";

import { Home } from "@/components/home/Home";
import type { Example } from "@/components/home/types";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";
import { siteMode } from "@/lib/site-mode";
import { listBaskets } from "@/server/baskets/queries";
import { getSession } from "@/server/session";

import "../landing.css";
import "../home.css";
import "../join/join.css";

export const metadata: Metadata = {
  title: "Thesis — see a trend, find your basket",
  description:
    "Paste an X link or describe an investment idea and see which reviewed baskets of tokenized stocks express it.",
};

export const dynamic = "force-dynamic";

/**
 * The public homepage.
 *
 * Open to everybody. It reads the catalogue and renders, and it never redirects — the wallet gate
 * lives at /connect, which is what keeps this page from being able to start a connection loop.
 *
 * The three examples are taken from real published baskets rather than written: each is that
 * basket's own reviewed claim, so trying one demonstrates matching against a case a person
 * actually signed off, and the page cannot advertise an idea the catalogue does not hold.
 */
export default async function HomePage() {
  if (siteMode() === "waitlist") return <WaitlistLanding source="home" />;

  const [baskets, session] = await Promise.all([listBaskets(), getSession()]);

  const examples: Example[] = baskets
    .map((b) => {
      const origin = b.arguments.find((a) => a.role === "origin");
      const idea = origin?.claim?.trim();
      return idea && idea.length >= 30 ? { label: b.category, idea } : null;
    })
    .filter((x): x is Example => x !== null)
    .slice(0, 3);

  /*
   * "Explore terminal" obeys the terminal's own rules rather than second-guessing them: a signed-in
   * visitor goes straight there, and an unsigned one is sent to the gate already carrying /app as
   * its destination, so connecting lands in the terminal instead of back here.
   */
  const terminalHref = session ? "/app" : `/connect?next=${encodeURIComponent("/app")}`;

  return <Home examples={examples} terminalHref={terminalHref} basketCount={baskets.length} />;
}
