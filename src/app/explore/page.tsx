import type { Metadata } from "next";
import "../landing.css";
import "../calls.css";
import "./explore.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CallGrid } from "@/components/calls/CallGrid";
import { listPublishedTheses } from "@/server/content/queries";
import { getCalls } from "@/server/calls/service";

export const metadata: Metadata = {
  title: "Explore calls · Thesis",
  description: "Creator-made investment calls. Read the argument, inspect the basket, and back what you believe.",
};
export const revalidate = 60;

export default async function ExplorePage() {
  const [theses, calls] = await Promise.all([listPublishedTheses(), getCalls()]);
  return <div className="landing">
    <a className="ln-skip" href="#main">Skip to content</a>
    <SiteHeader active="explore" />
    <main id="main" className="ln-container">
      <section className="ex-head">
        <p className="ln-eyebrow">Conviction has a clock.</p>
        <h1 className="ln-h2 ex-question">Find a take.<br />Put money behind it.</h1>
        <p className="ex-sub">Creator-made theses. Baskets you can buy. Calls with a finish line.</p>
      </section>
      <CallGrid theses={theses} calls={calls} />
      <p className="ex-note">Every call keeps its original rules. Buy the underlying tokens in your own wallet, then follow how the call plays out. Your entry price and allocation can differ from the creator’s model.</p>
    </main>
    <SiteFooter />
  </div>;
}
