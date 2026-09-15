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
  description: "Ideas worth arguing about, read as investments. The original post, our interpretation, the basket, and a call with a deadline.",
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
        <p className="ex-sub">An idea someone shared. Our reading of what it means for a portfolio. A basket you can buy, and a call with a finish line.</p>
      </section>
      <CallGrid theses={theses} calls={calls} />
      <p className="ex-note">Every call keeps its original rules. Buy the underlying tokens in your own wallet, then follow how the call plays out. Your entry price and allocation can differ from the model basket the call is scored against.</p>
    </main>
    <SiteFooter />
  </div>;
}
