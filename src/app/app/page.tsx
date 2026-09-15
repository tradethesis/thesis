import type { Metadata } from "next";

import { CallGrid } from "@/components/calls/CallGrid";
import { AppHeader } from "@/components/app/AppHeader";
import { getCalls } from "@/server/calls/service";
import { listPublishedTheses } from "@/server/content/queries";

import "../landing.css";
import "../calls.css";
import "./app.css";

export const metadata: Metadata = {
  title: "Open calls",
  description:
    "Every open call: the idea, how it is doing against its benchmark, and the basket you can buy in your own wallet.",
  alternates: { canonical: "/app" },
};

export const revalidate = 60;

/**
 * The product.
 *
 * Split out from the landing page, which used to carry the same grid halfway down between
 * a hero and a marketing section. One surface was doing both jobs and neither well: the
 * calls were furniture in an argument for the product, and the argument was in the way of
 * the calls.
 *
 * So the landing sells and this reads. No hero, no section rhythm — the first thing under
 * the header is the controls, and the second is the work.
 */
export default async function AppPage() {
  const [theses, calls] = await Promise.all([listPublishedTheses(), getCalls()]);

  return (
    <div className="landing ap">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <AppHeader />

      <main id="main" className="ap-main">
        <div className="ap-head">
          <h1 className="ap-title">Open calls</h1>
        </div>

        <CallGrid theses={theses} calls={calls} />

        {/*
          The two standing disclosures, stated once. They used to sit on every card, where
          repetition turned them into furniture — and a card carrying them six times over is
          also a card whose buy button is off the bottom of the screen.
        */}
        <p className="ap-note">
          Figures are model quotes against SPYx, not your return. Nobody&rsquo;s position is attached to any of
          these — Thesis holds none of it, and you buy into your own wallet.
        </p>
      </main>
    </div>
  );
}
