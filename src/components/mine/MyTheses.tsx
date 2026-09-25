"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";

import { callForThesis, callTiming, type CallRecord } from "@/lib/calls";
import { summarise } from "@/lib/conviction";
import { useConviction, type MyConviction } from "@/lib/use-conviction";
import { useFollowing } from "@/lib/following";
import { formatAmount, formatPrice, formatSignedUsd, formatUsd, type Portfolio, type ThesisRow } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/use-portfolio";
import type { ThesisCard } from "@/server/content/queries";

import { SignIn } from "../buy/SignIn";
import { useWallet } from "../buy/useWallet";
import { TokenLogo } from "../calls/TokenLogo";
import { PerformanceChart } from "../calls/PerformanceChart";
import type { SeriesPoint } from "@/server/calls/observations";

/** "purchases" is the portfolio; the key is kept because links (the gift page) already use it. */
type Tab = "record" | "purchases" | "following";

/**
 * What somebody owns, the sides they have taken, and the theses they keep an eye on.
 *
 * Three different kinds of fact, never mixed. The portfolio is read from the chain for the
 * signed-in wallet and priced live (src/server/portfolio.ts): what the wallet holds now, not
 * what this app remembers buying. The record is scored calls. Following is a list in this
 * browser and needs no wallet.
 */
export function MyTheses({ theses, calls, series }: { theses: ThesisCard[]; calls: CallRecord[]; series: Record<string, SeriesPoint[]> }) {
  const [tab, setTab] = useState<Tab>("record");
  const { slugs, ready, error, toggle } = useFollowing();
  const wallet = useWallet();
  const { mine: convictions, ready: convictionsReady, take } = useConviction();

  const { portfolio, needsSession, failed: loadFailed } = usePortfolio(wallet.wallet);

  // Open on what they own. `?tab=` wins (the gift page links to purchases); otherwise anybody
  // holding something or with purchases — a gift recipient, say — lands on the portfolio.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (picked) return;
    const asked = new URLSearchParams(window.location.search).get("tab");
    if (asked === "purchases" || asked === "following" || asked === "record") {
      setTab(asked);
      setPicked(true);
      return;
    }
    if (needsSession || loadFailed) return setPicked(true);
    if (!portfolio) return;
    if (portfolio.holdings.length || portfolio.theses.length || portfolio.simulated.length) setTab("purchases");
    setPicked(true);
  }, [picked, portfolio, needsSession, loadFailed]);

  const followed = theses.filter((t) => slugs.includes(t.slug));

  return (
    <>
      <div className="mine-tabs" role="group" aria-label="My theses">
        <button type="button" aria-pressed={tab === "purchases"} onClick={() => { setPicked(true); setTab("purchases"); }}>
          Portfolio
        </button>
        <button type="button" aria-pressed={tab === "record"} onClick={() => { setPicked(true); setTab("record"); }}>
          Your record{convictionsReady && convictions?.size ? ` · ${convictions.size}` : ""}
        </button>
        <button type="button" aria-pressed={tab === "following"} onClick={() => { setPicked(true); setTab("following"); }}>
          Following{ready && slugs.length ? ` · ${slugs.length}` : ""}
        </button>
      </div>

      {tab === "record" ? (
        <Record convictions={convictions} onClear={take} />
      ) : tab === "purchases" ? (
        <PortfolioView portfolio={portfolio} needsSession={needsSession} failed={loadFailed} wallet={wallet} />
      ) : (
        <Following theses={followed} calls={calls} series={series} ready={ready} error={error} onUnfollow={toggle} />
      )}
    </>
  );
}

/**
 * Every side you have taken, scored from the day you took it.
 *
 * This is the only page in the app that shows a personal result, and the reason it can is
 * that a conviction costs nothing and needs no wallet. The discipline that makes it worth
 * reading is that nothing is counted before it has been measured: the header reports what
 * has actually been scored separately from what has merely been taken, so the record cannot
 * be improved by taking more calls nobody has judged yet.
 */
function Record({
  convictions,
  onClear,
}: {
  convictions: Map<string, MyConviction> | null;
  onClear: (thesisId: string, side: "backing" | "doubting") => void;
}) {
  if (convictions === null) {
    return <p className="mine-empty" role="status">Reading your record…</p>;
  }

  const rows = [...convictions.values()];
  if (!rows.length) {
    return (
      <div className="mine-empty">
        <h2>You have not called anything yet.</h2>
        <p>Back a belief or doubt it from the feed. It costs nothing, needs no wallet, and is scored from the day you call it.</p>
        <Link href="/app" className="ln-btn ln-btn--ink">
          Discover beliefs
        </Link>
      </div>
    );
  }

  const summary = summarise(rows.map((r) => r.score));

  return (
    <>
      <p className="rec-summary">
        <strong>{summary.taken}</strong> {summary.taken === 1 ? "call" : "calls"} ·{" "}
        {summary.scorable ? (
          <>
            <strong>{summary.scorable}</strong> scored so far, <strong>{summary.ahead}</strong> ahead
          </>
        ) : (
          <>none scored yet</>
        )}
        {summary.tooEarly ? ` · ${summary.tooEarly} waiting on a reading` : ""}
        {summary.unscored ? ` · ${summary.unscored} with no call to score against` : ""}
      </p>

      <ul className="mine-list">
        {rows.map((c) => (
          <li key={c.thesisId} className="mine-row">
            <div className="mine-row-head">
              <h2>
                <Link href={`/t/${c.slug}`}>{c.claim}</Link>
              </h2>
              <span className={`rec-side rec-side--${c.side}`}>
                {c.side === "backing" ? <ThumbsUp size={12} aria-hidden="true" /> : <ThumbsDown size={12} aria-hidden="true" />}
                {c.side === "backing" ? "Backing" : "Doubting"}
              </span>
            </div>

            {/* Two facts, two lines. Joined by a separator the verdict pushed onto its own
                line anyway, leaving the dot stranded at the end of the date. */}
            <p className="mine-meta">
              Called on{" "}
              {new Date(c.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </p>
            <p className="mine-meta rec-line">
              <RecordVerdict conviction={c} />
            </p>

            {/* Only the window being scored. Showing the call's whole history here would
                credit this person with a rise that happened before they arrived. */}
            {c.points.length >= 2 && (
              <div className="mine-chart">
                <PerformanceChart points={c.points} benchmarkLabel="SPYx" />
              </div>
            )}

            <p className="mine-meta">
              <button type="button" className="mine-unfollow" onClick={() => onClear(c.thesisId, c.side)}>
                Clear this call<span className="ln-sr-only">: {c.claim}</span>
              </button>
              <Link href={`/t/${c.slug}#history`} className="mine-record">
                The record <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            </p>
          </li>
        ))}
      </ul>

      <p className="page-note">
        Every call is scored from the first reading that lands after you made it, never from when the call started, and
        switching sides restarts that clock. Readings arrive about once a day. A call is a public record of a view, not
        a wager: nothing is staked and nothing is paid out.
      </p>
    </>
  );
}

function RecordVerdict({ conviction }: { conviction: MyConviction }) {
  const { score, side } = conviction;
  if (score.status === "unscored") return <span>no call on this basket to score against</span>;
  if (score.status === "closed") return <span>closed — the basket changed after you called it</span>;
  if (score.status === "too_early") return <span>too early to score</span>;

  const edge = Math.abs(score.edgePercent ?? 0).toFixed(2);
  if (score.status === "level") return <span>level with SPYx since you called it</span>;

  const ahead = score.status === "ahead";
  return (
    <span className={ahead ? "rec-verdict is-ahead" : "rec-verdict is-behind"}>
      <strong className="ln-num">{ahead ? "Ahead" : "Behind"} {edge}%</strong>{" "}
      {side === "backing"
        ? ahead ? "— the basket is beating SPYx" : "— the basket is trailing SPYx"
        : ahead ? "— the basket is trailing SPYx" : "— the basket is beating SPYx"}
    </span>
  );
}

function PortfolioView({
  portfolio,
  needsSession,
  failed,
  wallet,
}: {
  portfolio: Portfolio | null;
  needsSession: boolean;
  failed: boolean;
  wallet: ReturnType<typeof useWallet>;
}) {
  if (needsSession) {
    return (
      <div className="mine-empty">
        <h2>Sign in to see your portfolio.</h2>
        <p>Your stocks are read straight from your own wallet, so only you can see them.</p>
        <SignIn wallet={wallet} />
      </div>
    );
  }
  if (failed) {
    return <p className="mine-empty">Couldn&rsquo;t read your wallet just now. Reload the page to try again.</p>;
  }
  if (!portfolio) return <p className="mine-empty" role="status">Reading your wallet…</p>;

  const { holdings, theses, simulated } = portfolio;
  if (!holdings.length && !theses.length && !simulated.length && portfolio.cashUsd === 0) {
    return (
      <div className="mine-empty">
        <h2>Nothing here yet.</h2>
        <p>Stocks you buy or are gifted show up here, with what they&rsquo;re worth today.</p>
        <Link href="/app" className="ln-btn ln-btn--ink">
          Find a thesis
        </Link>
      </div>
    );
  }

  const asOf = new Date(portfolio.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="pf">
      <section className="pf-total" aria-label="Total value">
        <p className="pf-label">Total value</p>
        <p className="pf-total-value ln-num">{formatUsd(portfolio.totalUsd)}</p>
        <dl className="pf-split">
          <div><dt>Stocks</dt><dd className="ln-num">{formatUsd(portfolio.holdingsUsd)}</dd></div>
          <div><dt>Cash (USDC)</dt><dd className="ln-num">{formatUsd(portfolio.cashUsd)}</dd></div>
        </dl>
        <p className="pf-asof">
          Live prices as of {asOf}. Read from your wallet on Solana.
          {portfolio.unpriced > 0 && <> {portfolio.unpriced === 1 ? "One holding has" : `${portfolio.unpriced} holdings have`} no price right now and {portfolio.unpriced === 1 ? "isn’t" : "aren’t"} in the total.</>}
        </p>
      </section>

      {holdings.length > 0 && (
        <section className="pf-section" aria-labelledby="pf-stocks">
          <h2 id="pf-stocks" className="pf-h2">Your stocks</h2>
          <ul className="pf-holdings">
            {holdings.map((h, i) => (
              <li key={h.mint} className="pf-holding">
                <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={36} />
                <div className="pf-holding-name">
                  <strong>{h.company}</strong>
                  <span className="ln-num">{formatAmount(h.amount)} {h.symbol}</span>
                </div>
                <div className="pf-holding-price">
                  <span className="pf-cell-label">Price</span>
                  <span className="ln-num">{h.priceUsd === null ? "—" : formatPrice(h.priceUsd)}</span>
                </div>
                <div className="pf-holding-value">
                  <strong className="ln-num">{h.valueUsd === null ? "Price unavailable" : formatUsd(h.valueUsd)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {theses.length > 0 && (
        <section className="pf-section" aria-labelledby="pf-theses">
          <h2 id="pf-theses" className="pf-h2">By thesis</h2>
          <p className="pf-note">What each purchase bought, valued at today&rsquo;s prices. If you&rsquo;ve sold or moved tokens since, &ldquo;Your stocks&rdquo; above is the real count.</p>
          <ul className="pf-theses">{theses.map((t) => <ThesisPosition key={t.intentId} row={t} />)}</ul>
        </section>
      )}

      {simulated.length > 0 && (
        <details className="pf-section pf-practice">
          <summary>Practice purchases · {simulated.length} <span>not real money, not in your total</span></summary>
          <ul className="pf-theses">{simulated.map((t) => <ThesisPosition key={t.intentId} row={t} />)}</ul>
        </details>
      )}
    </div>
  );
}

function ThesisPosition({ row }: { row: ThesisRow }) {
  const tone = row.changeUsd === null || row.changeUsd === 0 ? "" : row.changeUsd > 0 ? "is-up" : "is-down";
  return (
    <li className="pf-thesis">
      <div className="pf-thesis-head">
        <h3><Link href={`/t/${row.slug}`}>{row.claim}</Link></h3>
        <span className="pf-thesis-date">
          {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
        </span>
      </div>
      <dl className="pf-thesis-figures">
        <div><dt>Put in</dt><dd className="ln-num">{formatUsd(row.putInUsd)}</dd></div>
        <div><dt>Worth today</dt><dd className="ln-num">{row.nowUsd === null ? "Price unavailable" : formatUsd(row.nowUsd)}</dd></div>
        <div>
          <dt>Change</dt>
          <dd className={`ln-num ${tone}`}>
            {row.changeUsd === null ? "—" : formatSignedUsd(row.changeUsd)}
            {row.changePct !== null && <small> ({row.changePct > 0 ? "+" : ""}{row.changePct.toFixed(1)}%)</small>}
          </dd>
        </div>
      </dl>
      <ul className="mine-legs">
        {row.holdings.map((h, i) => (
          <li key={h.symbol} className="is-filled">
            <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
            <span className="ln-num">{formatAmount(h.amount)} {h.symbol}</span>
          </li>
        ))}
      </ul>
      {row.missing > 0 && (
        <p className="pf-note">{row.missing === 1 ? "One holding wasn’t bought" : `${row.missing} holdings weren’t bought`}; that money stayed in your wallet as USDC.</p>
      )}
    </li>
  );
}

function Following({
  theses,
  calls,
  series,
  ready,
  error,
  onUnfollow,
}: {
  theses: ThesisCard[];
  calls: CallRecord[];
  series: Record<string, SeriesPoint[]>;
  ready: boolean;
  error: string | null;
  onUnfollow: (slug: string) => void;
}) {
  if (!ready) return <p className="mine-empty" role="status">Reading your saved list…</p>;

  if (!theses.length) {
    return (
      <div className="mine-empty">
        <h2>Nothing followed yet.</h2>
        <p>Follow a belief and its editorial updates and call results collect here. Saved in this browser only.</p>
        <Link href="/app" className="ln-btn ln-btn--ink">
          Discover beliefs
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && <p className="mine-error" role="alert">{error}</p>}
      <ul className="mine-list">
        {theses.map((t) => {
          const call = callForThesis(calls, t);
          return (
            <li key={t.slug} className="mine-row">
              <div className="mine-row-head">
                <h2>
                  <Link href={`/t/${t.slug}`}>{t.claim}</Link>
                </h2>
                <button type="button" className="mine-unfollow" onClick={() => onUnfollow(t.slug)}>
                  <Bookmark size={14} aria-hidden="true" />
                  Unfollow<span className="ln-sr-only">: {t.claim}</span>
                </button>
              </div>

              {/* Real published updates only. There is no unread count and no notification,
                  because nothing here is pushed — this list is read when you open it. */}
              {t.latestUpdate ? (
                <div className="mine-update">
                  <p className="mine-update-head">
                    Editorial update ·{" "}
                    {new Date(t.latestUpdate.authoredAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </p>
                  <strong>{t.latestUpdate.title}</strong>
                  <p>{t.latestUpdate.body}</p>
                </div>
              ) : (
                <p className="mine-meta">
                  Following version {t.versionNumber}. No editorial updates since it was published.
                </p>
              )}

              {call && (
                <div className="mine-chart">
                  <PerformanceChart points={series[call.id] ?? []} benchmarkLabel={call.benchmark} />
                </div>
              )}

              <p className="mine-meta">
                {call ? `Call: ${callTiming(call).label}` : "No call on this basket"}
                <Link href={`/t/${t.slug}#history`} className="mine-record">
                  The record <ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              </p>
            </li>
          );
        })}
      </ul>

      <p className="page-note">
        Your follow list is stored in this browser. It is not tied to your wallet, does not sync to an account, and
        sends no notifications.
      </p>
    </>
  );
}
