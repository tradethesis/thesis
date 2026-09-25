import type { Metadata } from "next";

import { CreateThesis } from "@/components/create/CreateThesis";
import { EQUITY_ASSETS, CRYPTO_ASSETS } from "@/server/assets/allowlist";

import "./create.css";

export const metadata: Metadata = {
  title: "Write a thesis",
  description: "Turn a belief into a basket anybody can buy.",
};

/**
 * Writing a thesis.
 *
 * The asset list is resolved on the server from the allowlist, so the form can only offer
 * things this app can actually buy. A symbol typed by hand would be a symbol we then have to
 * refuse at submit time, which is the worst place to find out.
 *
 * PreStocks are deliberately absent. They are on the allowlist and disabled, they charge 0.5%
 * on transfer, and a thesis built on one could never have a token whose fees were claimable.
 */
export default function CreateThesisPage() {
  const assets = [...EQUITY_ASSETS, ...CRYPTO_ASSETS]
    .filter((a) => a.enabled)
    .map((a) => ({ symbol: a.symbol, company: a.company }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <>
      <div className="page-head">
        <h1>Write a thesis</h1>
        <p>A claim about the future, three things that express it, and the strongest case you are wrong.</p>
      </div>
      <CreateThesis assets={assets} />
    </>
  );
}
