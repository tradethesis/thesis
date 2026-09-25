"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Flame, TrendingUp } from "lucide-react";

import { benchmarkName, signedPercent } from "@/lib/calls";
import { drawerLinkProps } from "@/lib/open-thesis";

import { ThesisAuthor, type AuthorRef } from "../calls/ThesisAuthor";

export type Mover = {
  slug: string;
  claim: string;
  author: AuthorRef;
  basketPercent: number;
  edgePercent: number;
  benchmark: string;
  /** Days since the call was struck. */
  days: number;
  calls: number;
  /** USDC actually spent through this app, live purchases only. Zero means zero. */
  volumeUsdc: number;
};

export type Called = {
  slug: string;
  claim: string;
  author: AuthorRef;
  total: number;
  ahead: number;
  scorable: number;
  basketPercent: number | null;
};

/**
 * What is moving and what people are calling, beside the feed.
 *
 * The left rail exists because a feed in claim order answers "what is there" and never
 * "what changed". Both lists here are the same records the leaderboard ranks, cut to five —
 * this is a way in, not a second scoreboard, so anything that needs a caveat to be read
 * correctly belongs there instead.
 *
 * Hidden on the leaderboard, where it would sit next to a longer, better version of itself.
 *
 * Every figure is a model quote and says so once, at the bottom, rather than on each row.
 */
export function TrendingRail({ movers, called }: { movers: Mover[]; called: Called[] }) {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/app/leaderboard")) return null;
  if (!movers.length && !called.length) return null;

  return (
    <aside className="rail rail--left" aria-label="Trending">
      <div className="rail-inner">
        {movers.length > 0 && (
          <section>
            <div className="rail-head">
              <h2>
                <TrendingUp size={14} aria-hidden="true" />
                Moving most
              </h2>
              <Link href="/app/leaderboard">
                All <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            </div>

            <ol className="rail-rank">
              {movers.map((m, i) => (
                <li key={m.slug}>
                  <span className="rail-pos">{i + 1}</span>
                  <div className="rail-body">
                    <a {...drawerLinkProps(m.slug)}>{m.claim}</a>
                    <ThesisAuthor author={m.author} />
                    <p className="rail-stats">
                      <span className={m.edgePercent > 0 ? "is-up" : m.edgePercent < 0 ? "is-down" : ""}>
                        {signedPercent(m.edgePercent).replace("%", " pts")} vs {benchmarkName(m.benchmark)}
                      </span>
                      <span>{m.days}d</span>
                      {m.calls > 0 && <span>{m.calls} {m.calls === 1 ? "call" : "calls"}</span>}
                      {/* Only when somebody really spent. Every intent in development is a
                          simulation, and a volume figure that is only true in development
                          is worse than none. */}
                      {m.volumeUsdc > 0 && <span>${Math.round(m.volumeUsdc).toLocaleString("en-US")}</span>}
                    </p>
                  </div>
                  <span className={`rail-fig ln-num ${m.basketPercent > 0 ? "is-up" : m.basketPercent < 0 ? "is-down" : ""}`}>
                    {signedPercent(m.basketPercent)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {called.length > 0 && (
          <section className={movers.length ? "rail-block" : undefined}>
            <div className="rail-head">
              <h2>
                <Flame size={14} aria-hidden="true" />
                Most called
              </h2>
            </div>

            <ol className="rail-rank">
              {called.map((c, i) => (
                <li key={c.slug}>
                  <span className="rail-pos">{i + 1}</span>
                  <div className="rail-body">
                    <a {...drawerLinkProps(c.slug)}>{c.claim}</a>
                    <ThesisAuthor author={c.author} />
                    <p className="rail-stats">
                      {/* The headcount, never a split. A share of the vote is gated on the
                          crowd floor and this rail is too small to carry that caveat. */}
                      <span>{c.total} {c.total === 1 ? "call" : "calls"}</span>
                      {c.scorable > 0 && <span>{c.ahead} of {c.scorable} ahead</span>}
                    </p>
                  </div>
                  {c.basketPercent !== null && (
                    <span className={`rail-fig ln-num ${c.basketPercent > 0 ? "is-up" : c.basketPercent < 0 ? "is-down" : ""}`}>
                      {signedPercent(c.basketPercent)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="rail-foot">Compared with the S&amp;P 500. Estimated from market prices, not your own return.</p>
      </div>
    </aside>
  );
}
