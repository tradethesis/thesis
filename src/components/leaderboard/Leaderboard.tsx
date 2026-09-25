"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { benchmarkName, plainStatement, callTiming, signedPercent, type CallRecord } from "@/lib/calls";
import { crowdSplit } from "@/lib/conviction";
import type { CrowdStanding } from "@/server/conviction";
import { cohortsOf, rankCalls, startCohort, type RankMetric, type RankScope } from "@/lib/leaderboard";
import type { ThesisCard } from "@/server/content/queries";

import { ThesisAuthor, authorOf, type AuthorRef } from "../calls/ThesisAuthor";
import { TokenLogo } from "../calls/TokenLogo";

const EXCLUDED_COPY: Record<string, string> = {
  awaiting_first_observation: "No prices yet",
  stale_prices: "Prices need a refresh",
  no_valid_close: "No reliable closing price",
};

/**
 * The record, ranked.
 *
 * The default is completed calls by outperformance, and it stays the default even when
 * nothing has completed. Switching silently to live calls so the page looks populated would
 * present four unfinished bets as a track record, which is the exact thing a leaderboard on
 * a financial product must not do.
 *
 * Rows that cannot be ranked — stale prices, no observation since the start, a deadline that
 * passed without a valid close — are shown without a position rather than dropped. A gap you
 * can see is honest; a gap you cannot see is a filtered table pretending to be complete.
 */
export function Leaderboard({
  theses,
  calls,
  crowd,
  versions = {},
}: {
  theses: ThesisCard[];
  calls: CallRecord[];
  crowd: (CrowdStanding & { author?: AuthorRef })[];
  /** Each call's own version: its claim then, and its number. */
  versions?: Record<string, { claim: string; number: number }>;
}) {
  const [view, setView] = useState<"calls" | "crowd">("calls");
  // Calls run 90 days; until one finishes, open on the live ones rather than an empty table.
  const [scope, setScope] = useState<RankScope>(() => (rankCalls(calls, { scope: "completed", metric: "edge" }).length ? "completed" : "live"));
  const [metric, setMetric] = useState<RankMetric>("edge");
  const [cohort, setCohort] = useState<string | null>(null);

  return (
    <>
      <div className="lb-tabs lb-views" role="group" aria-label="What to rank">
        <button type="button" aria-pressed={view === "calls"} onClick={() => setView("calls")}>
          Basket calls
        </button>
        <button type="button" aria-pressed={view === "crowd"} onClick={() => setView("crowd")}>
          People&rsquo;s calls{crowd.length ? ` · ${crowd.length}` : ""}
        </button>
      </div>

      {view === "crowd" ? (
        <Crowd standings={crowd} />
      ) : (
        <CallRanking
          theses={theses}
          calls={calls}
          versions={versions}
          scope={scope}
          setScope={setScope}
          metric={metric}
          setMetric={setMetric}
          cohort={cohort}
          setCohort={setCohort}
        />
      )}
    </>
  );
}

/**
 * What people called, per belief.
 *
 * Not a table of people. Every owner is an anonymous browser id or a wallet address, and
 * ranking those would publish a list of identifiers; a chosen display name would need an
 * account system this product does not have. So the unit is the belief, which is the thing
 * a reader wants ranked anyway.
 *
 * The split is withheld below the floor and the headcount is always printed, so a row built
 * on three people can never read as a consensus.
 */
function Crowd({ standings }: { standings: (CrowdStanding & { author?: AuthorRef })[] }) {
  if (!standings.length) {
    return (
      <div className="lb-empty">
        <h2>Nobody has called anything yet.</h2>
        <p>Back a belief or doubt it from the feed. It is free, needs no wallet, and every call is scored from the day it was made.</p>
        <Link href="/app" className="ln-btn ln-btn--ink">
          Discover beliefs
        </Link>
      </div>
    );
  }

  return (
    <>
      <ol className="lb">
        {standings.map((s, i) => {
          const split = crowdSplit(s.backing, s.doubting);
          return (
            <li key={s.thesisId} className="lb-row">
              <span className="lb-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>

              <div className="lb-main">
                <h2>
                  <Link href={`/t/${s.slug}`}>{s.claim}</Link>
                </h2>
                <p className="lb-by">
                  {s.author && <ThesisAuthor author={s.author} size="md" prefix="Basket by" />}
                  <span className="lb-cohort">
                    {split.show
                      ? `${Math.round(split.backingPct)}% backing, ${100 - Math.round(split.backingPct)}% doubting`
                      : "Too few calls to show a split"}
                  </span>
                </p>
              </div>

              <div className="lb-figures">
                <strong>{s.total}</strong>
                <span>{s.total === 1 ? "call" : "calls"}</span>
                <small>
                  {s.scorable ? `${s.ahead} of ${s.scorable} scored ahead` : "none scored yet"}
                </small>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="page-note">
        Each call is scored from the first reading after the person made it, never from when the call started, so two
        people on the same side can have different results. A call is a public record of a view, not a wager. Splits
        are withheld until at least five people have called a belief, and the headcount is always shown.
      </p>
    </>
  );
}

function CallRanking({
  theses,
  calls,
  versions,
  scope,
  setScope,
  metric,
  setMetric,
  cohort,
  setCohort,
}: {
  theses: ThesisCard[];
  calls: CallRecord[];
  versions: Record<string, { claim: string; number: number }>;
  scope: RankScope;
  setScope: (s: RankScope) => void;
  metric: RankMetric;
  setMetric: (m: RankMetric) => void;
  cohort: string | null;
  setCohort: (c: string | null) => void;
}) {
  const byThesis = useMemo(() => new Map(theses.map((t) => [t.thesisId, t])), [theses]);
  const cohorts = useMemo(() => cohortsOf(calls), [calls]);
  const rows = useMemo(() => rankCalls(calls, { scope, metric, cohort }), [calls, scope, metric, cohort]);
  const completedCount = useMemo(() => rankCalls(calls, { scope: "completed", metric }).length, [calls, metric]);

  return (
    <>
      <div className="lb-controls">
        <div className="lb-tabs" role="group" aria-label="Which calls">
          <button type="button" aria-pressed={scope === "completed"} onClick={() => setScope("completed")}>
            Completed
          </button>
          <button type="button" aria-pressed={scope === "live"} onClick={() => setScope("live")}>
            Live
          </button>
        </div>

        <div className="lb-selects">
          <label>
            <span className="ln-sr-only">Rank by</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as RankMetric)}>
              <option value="edge">Outperformance</option>
              <option value="basket">Basket return</option>
            </select>
          </label>

          {cohorts.length > 1 && (
            <label>
              <span className="ln-sr-only">Started in</span>
              <select value={cohort ?? ""} onChange={(e) => setCohort(e.target.value || null)}>
                <option value="">All start weeks</option>
                {cohorts.map((c) => (
                  <option key={c} value={c}>
                    Started {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="lb-empty">
          <h2>{scope === "completed" ? "No call has finished yet." : "No live calls."}</h2>
          <p>
            {scope === "completed"
              ? "Every call in the catalogue is still running. The first results land 90 days after each call started — losses included."
              : "Nothing is running in this view right now."}
          </p>
          {scope === "completed" && (
            <button type="button" className="ln-btn ln-btn--ink" onClick={() => setScope("live")}>
              View live calls
            </button>
          )}
        </div>
      ) : (
        <ol className="lb">
          {rows.map((row) => {
            const t = byThesis.get(row.call.thesisId);
            const value = metric === "edge" ? row.edgePercent : row.basketPercent;
            const timing = callTiming(row.call);

            return (
              <li key={row.call.id} className={`lb-row${row.rank === null ? " is-unranked" : ""}`}>
                <span className="lb-rank" aria-label={row.rank ? `Rank ${row.rank}` : "Not ranked"}>
                  {row.rank ?? "—"}
                </span>

                <div className="lb-main">
                  <h2>
                    {t ? <Link href={`/t/${t.slug}`}>{versions[row.call.versionId]?.claim ?? t.claim}</Link> : plainStatement(row.call.statement)}
                    {/* Only worth saying when this thesis has more than one call on the board. */}
                    {versions[row.call.versionId] && calls.filter((c) => c.thesisId === row.call.thesisId).length > 1 && (
                      <span className="lb-version">v{versions[row.call.versionId].number}</span>
                    )}
                  </h2>
                  {/* Whose belief this is, with their face, on the row that ranks it.
                      A leaderboard of numbers with no author is a scoreboard nobody can be
                      held to. */}
                  <p className="lb-by">
                    <ThesisAuthor
                      author={t ? authorOf(t) : { name: "Thesis editorial", handle: null }}
                      size="md"
                      prefix="Basket by"
                    />
                    <span className="lb-cohort">started {row.cohort}</span>
                  </p>
                  {t && (
                    <ul className="lb-assets" aria-label="Basket">
                      {t.holdings.map((h, i) => (
                        <li key={h.symbol}>
                          <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
                          <span className="ln-sr-only">{h.symbol}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="lb-figures">
                  {row.excludedReason ? (
                    <span className="lb-excluded">{EXCLUDED_COPY[row.excludedReason]}</span>
                  ) : (
                    <>
                      <strong className={value !== null && value > 0 ? "is-up" : value !== null && value < 0 ? "is-down" : ""}>
                        {value === null ? "—" : signedPercent(value).replace("%", metric === "edge" ? " pts" : "%")}
                      </strong>
                      <span>
                        {metric === "edge"
                          ? `vs ${benchmarkName(row.call.benchmark)}`
                          : `${benchmarkName(row.call.benchmark)} ${row.benchmarkPercent === null ? "—" : signedPercent(row.benchmarkPercent)}`}
                      </span>
                    </>
                  )}
                  <small>{timing.label}</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="page-note">
        Ranked on model quotes from each call&rsquo;s fixed starting snapshot, not on anybody&rsquo;s realised return.
        Calls whose prices are stale, that have no prices since they started, or that reached their deadline
        without a reliable closing price are listed without a rank rather than ranked on numbers we cannot stand
        behind. Equal figures to two decimal places share a rank. Losses are included, and an unresolved call is never
        a completed success. Beating a benchmark does not prove the argument behind the basket.
        {scope === "live" && completedCount === 0 && " No call has completed yet, so there is no track record to show."}
      </p>
    </>
  );
}

export { startCohort };
