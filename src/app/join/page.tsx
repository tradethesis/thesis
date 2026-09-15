import type { Metadata } from "next";
import "../landing.css";
import "./join.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { JoinForm } from "@/components/join/JoinForm";

export const metadata: Metadata = {
  title: "Join the waitlist — Thesis",
  description:
    "Buying is open to a small allowlist while access is worked out. Leave an email and we will tell you when it opens up.",
};

export default function JoinPage() {
  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader active="join" />
      <main className="ln-container jn-main" id="main">
        <header className="jn-head">
          <p className="ln-eyebrow">Early access</p>
          <h1 className="jn-h1">Get in when buying opens.</h1>
          <p className="jn-lead">
            Every thesis is already public and you can set an allocation without connecting anything. What is not open
            yet is buying: it runs for a small allowlist of wallets while market access is worked out.
          </p>
        </header>

        <JoinForm source="join" />

        <section className="jn-honest">
          <h2>What you are joining</h2>
          <ul>
            <li>An early product. Four theses today, added by hand, each with its sources and the argument against it.</li>
            <li>
              Purchases currently run in a labelled simulation: real prices and a real basket, but no signature is
              requested and nothing is sent to the chain.
            </li>
            <li>
              Tokenized stocks are restricted in the United States, Canada, the United Kingdom and Australia. A place on
              this list is not a promise of access.
            </li>
            <li>No token, no points, no airdrop. There is nothing to farm here.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
