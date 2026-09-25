"use client";

import Link from "next/link";
import { useState } from "react";

import { useWallet } from "@/components/buy/useWallet";
import { TokenLogo } from "@/components/calls/TokenLogo";
import { formatUsd } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/use-portfolio";

/**
 * Who is actually making money here, when we can say so truthfully.
 *
 * Right now we cannot, and this panel says that rather than filling itself with something that
 * resembles a trader leaderboard. What is missing is specific and worth naming, because each
 * item is a real thing that would have to start being recorded:
 *
 *   - **Holdings.** `position` and `position_holding` are declared and have no writer anywhere in
 *     the repository. Nothing knows what a wallet still holds, only what it once bought.
 *   - **Exit valuations.** `valuation` is likewise unwritten, so there is no current value for
 *     any remaining holding.
 *   - **Sale proceeds.** There is no sell flow, so the first term of the P&L formula is always
 *     zero and a "realised" figure would be all purchases and no disposals.
 *   - **Consent.** No wallet has agreed to appear in a public table of identities and returns.
 *     Publishing one would be a new privacy posture, not an extension of an existing one.
 *
 * The temptation this resists is renaming something that does exist — conviction standings,
 * crowd scores, USDC deployed — into "P&L". Those are real numbers about other things. Buy
 * volume is what somebody spent, not what they made, and a leaderboard that conflates the two is
 * worse than an empty one because it cannot be corrected by looking at it.
 */

type Scope = "basket" | "all";
type Tab = "holdings" | "traders";

/**
 * The right column. What you hold comes first and stays in view whatever basket is open: a
 * terminal that hides your own position behind a menu is a catalogue, not a terminal.
 */
export function TerminalRail({ basketName, basketSymbols }: { basketName: string | null; basketSymbols: string[] }) {
  const [tab, setTab] = useState<Tab>("holdings");
  return (
    <div className="tmr">
      <div className="tmr-tabs" role="tablist" aria-label="Side panel">
        <button type="button" role="tab" aria-selected={tab === "holdings"} onClick={() => setTab("holdings")}>My holdings</button>
        <button type="button" role="tab" aria-selected={tab === "traders"} onClick={() => setTab("traders")}>Top traders</button>
      </div>
      {tab === "holdings" ? <MyHoldings basketSymbols={basketSymbols} /> : <TraderLeaderboard basketName={basketName} />}
    </div>
  );
}

/** Read from the wallet on chain and priced live (/api/portfolio), the same as the Portfolio page. */
function MyHoldings({ basketSymbols }: { basketSymbols: string[] }) {
  const w = useWallet();
  const { portfolio: p, needsSession, failed } = usePortfolio(w.wallet);
  // Only the server's 401 means signed out; an unknown wallet on the client is still loading.
  if (needsSession) {
    return (
      <div className="tmt-empty">
        <p className="tmt-empty-head">Your holdings live here.</p>
        <p className="tmt-empty-body">Sign in to see what you own, what it&rsquo;s worth now, and which of it is in the basket you&rsquo;re looking at.</p>
        <Link className="tmh-link" href="/connect?next=/app">Sign in</Link>
      </div>
    );
  }
  if (failed) return <p className="tmh-quiet">Couldn&rsquo;t read your wallet just now.</p>;
  if (!p) return <p className="tmh-quiet" role="status">Reading your wallet…</p>;
  const inBasket = new Set(basketSymbols);
  return (
    <div className="tmh">
      <p className="tmh-total ln-num">{formatUsd(p.totalUsd)}</p>
      <p className="tmh-sub">
        Stocks {formatUsd(p.holdingsUsd)} · Cash {formatUsd(p.cashUsd)}
        {p.unpriced > 0 && <> · {p.unpriced} unpriced</>}
      </p>
      {p.holdings.length ? (
        <ul className="tmh-list">
          {p.holdings.map((h, i) => (
            <li key={h.mint} className={inBasket.has(h.symbol) ? "is-in" : ""}>
              <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={22} />
              <span className="tmh-name">
                <strong>{h.symbol}</strong>
                <span>{inBasket.has(h.symbol) ? "In this basket" : h.company}</span>
              </span>
              <span className="tmh-val ln-num">
                <strong>{h.valueUsd === null ? "—" : formatUsd(h.valueUsd)}</strong>
                <span>{h.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tmh-quiet">No stocks yet. Buy a basket and it shows up here.</p>
      )}
      <p className="tmh-asof">Live prices · {new Date(p.asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</p>
      <Link className="tmh-link" href="/app/my-theses?tab=purchases">Full portfolio →</Link>
    </div>
  );
}

export function TraderLeaderboard({ basketName }: { basketName: string | null }) {
  const [scope, setScope] = useState<Scope>("basket");

  return (
    <div className="tmt">
      <div className="tmt-head">
        <h2>Top traders</h2>
        <div className="tmt-scope" role="group" aria-label="Scope">
          <button type="button" aria-pressed={scope === "basket"} onClick={() => setScope("basket")}>
            This basket
          </button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            All
          </button>
        </div>
      </div>

      <p className="tmt-scope-line">
        {scope === "basket" ? (basketName ? `Showing ${basketName}.` : "Select a basket.") : "Across every basket."}
      </p>

      <div className="tmt-empty">
        <p className="tmt-empty-head">Trader rankings are coming.</p>
        <p className="tmt-empty-body">They&rsquo;ll rank people by what they actually hold. Until then, each basket&rsquo;s own record is on the left.</p>
      </div>
    </div>
  );
}
