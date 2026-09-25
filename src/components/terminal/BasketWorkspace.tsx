"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { BuyModal } from "../buy/BuyModal";
import { TokenLogo } from "../calls/TokenLogo";
import { TakeASide } from "../feed/TakeASide";
import { ThesisAuthor } from "../calls/ThesisAuthor";
import { excerptPost } from "@/lib/excerpt";

import { BasketPerformanceChart } from "./BasketPerformanceChart";
import type { TerminalBasket } from "./types";

/**
 * The selected basket: what it holds, how it has done, why people believe it, and buying it.
 *
 * The chart dominates because the question a reader arrives with is "how is this doing". The
 * arguments sit below it, several of them, each expandable — a basket can carry a bull case, a
 * hedge case and a flat contradiction of both without any of them implying the others.
 *
 * One rule governs the buy control: it pins `execution.executionThesisVersionId`, the immutable
 * version this basket's allocation belongs to, and never whichever argument is expanded. An
 * attached argument's author can say anything; they cannot move a weight.
 */
export function BasketWorkspace({ basket }: { basket: TerminalBasket }) {
  const { execution: ex, performance: perf } = basket;
  const last = perf?.points.at(-1);

  const origin = basket.arguments.find((a) => a.role === "origin") ?? basket.arguments[0] ?? null;
  const others = basket.arguments.filter((a) => a !== origin);

  return (
    <div className="tmw">
      <header className="tmw-head">
        <div className="tmw-title">
          <h1>{basket.name}</h1>
          <p className="tmw-desc">{basket.description}</p>
          <p className="tmw-by">
            Allocation by {basket.allocationAuthor.name} · {basket.category}
          </p>
        </div>

        <div className="tmw-figure">
          {last ? (
            <>
              <strong className={`ln-num ${last.basketPct > 0 ? "is-up" : last.basketPct < 0 ? "is-down" : ""}`}>
                {last.basketPct > 0 ? "+" : ""}
                {last.basketPct.toFixed(2)}%
              </strong>
              <span>
                since {new Date(perf!.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ·{" "}
                {perf!.status === "open" ? "live" : perf!.status}
              </span>
            </>
          ) : (
            <span className="tmw-untracked">Tracking begins at publication</span>
          )}
        </div>
      </header>

      <div className="tmw-actions">
        {ex.buyable ? (
          <BuyModal
            slug={ex.executionSlug}
            claim={basket.name}
            versionId={ex.executionThesisVersionId}
            authorName={basket.allocationAuthor.name}
            holdings={ex.holdings.map((h) => ({
              symbol: h.symbol,
              company: h.company,
              role: h.role ?? "",
              weightBps: h.weightBps,
            }))}
          >
            Buy basket
          </BuyModal>
        ) : (
          <p className="tmw-blocked">{ex.blockedReason ?? "This basket cannot be bought right now."}</p>
        )}
        <p className="tmw-basis">
          {perf?.observedAt
            ? `Prices as of ${new Date(perf.observedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.`
            : "No prices recorded yet."}{" "}
          Estimated from market prices; your own return may differ.
        </p>
      </div>

      {origin && <ThesisLead argument={origin} />}

      {/* The chart answers "how has it done", which only matters once you know what it is. Folded
          to one line; opening it keeps the full chart and its table. */}
      <details className="tmw-chart" aria-label="Performance">
        <summary>
          <span>Performance</span>
          {last ? (
            <span className="tmw-chart-sum ln-num">
              Basket <b className={last.basketPct > 0 ? "is-up" : last.basketPct < 0 ? "is-down" : ""}>{last.basketPct > 0 ? "+" : ""}{last.basketPct.toFixed(2)}%</b>
              {" · "}S&amp;P 500 <b className={last.benchmarkPct > 0 ? "is-up" : last.benchmarkPct < 0 ? "is-down" : ""}>{last.benchmarkPct > 0 ? "+" : ""}{last.benchmarkPct.toFixed(2)}%</b>
            </span>
          ) : (
            <span className="tmw-chart-sum">No prices yet</span>
          )}
          <ChevronDown size={16} aria-hidden="true" className="tmw-chart-chev" />
        </summary>
        <BasketPerformanceChart
          points={perf?.points ?? []}
          benchmark={perf?.benchmark ?? "SPYx"}
          startsAt={perf?.startsAt ?? new Date().toISOString()}
        />
      </details>

      <div className="tmw-split">
        <section className="tmw-holdings" aria-label="Holdings">
          <h2>Holdings</h2>
          <ul>
            {ex.holdings.map((h, i) => (
              <li key={h.mint}>
                <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={22} />
                <span className="tmw-h-sym">
                  <strong>{h.symbol}</strong>
                  <span>{h.company}</span>
                </span>
                <span className="tmw-h-role">{h.role ?? "—"}</span>
                <span className="tmw-h-wt ln-num">{h.weightBps / 100}%</span>
              </li>
            ))}
          </ul>
          {ex.weightRationale && <p className="tmw-why-weights">{ex.weightRationale}</p>}
        </section>

        <section className="tmw-activity" aria-label="Activity">
          <h2>Activity</h2>
          {basket.activity && basket.activity.buyers > 0 ? (
            <p className="tmw-act">
              <strong className="ln-num">{basket.activity.buyers}</strong>
              <span>
                {basket.activity.buyers === 1 ? "buyer" : "buyers"} · $
                {Math.round(basket.activity.volumeUsdc).toLocaleString("en-US")}
              </span>
              {/* Never "volume" or "TVL". This is what this app bought, and nothing else. */}
              <em>bought through Thesis. Not market volume, and not what those wallets hold now.</em>
            </p>
          ) : (
            <p className="tmw-act-none">Nothing has been bought through Thesis yet.</p>
          )}
        </section>
      </div>

      {others.length > 0 && (
        <section className="tmw-theses" aria-label="Other theses">
          <h2>
            Other takes on these holdings <span className="tmw-count">{others.length}</span>
          </h2>
          <p className="tmw-theses-note">
            Different people arguing for the same holdings. They do not agree with each other, and
            attaching one does not make its author responsible for the others.
          </p>
          {others.map((a) => (
            <Argument key={a.thesisVersionId} argument={a} />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * The thesis first: the voice it started from, then the claim, then the case. The person whose
 * post sparked it is credited as the source; the allocation and the call are not theirs, and the
 * card says so rather than borrowing their authority.
 */
function ThesisLead({ argument: a }: { argument: TerminalBasket["arguments"][number] }) {
  const src = a.source ?? null;
  const quote = src ? excerptPost(src.text) : null;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <section className="tmw-lead" aria-label="The thesis">
      {src && quote ? (
        <figure className="tmw-voice">
          <div className="tmw-voice-who">
            <ThesisAuthor author={{ name: src.author, handle: src.handle.replace(/^@/, "") }} size="sm" />
            <span>{src.handle} · {day(src.postedAt)}</span>
          </div>
          <blockquote>{quote.text}{quote.truncated ? "…" : ""}</blockquote>
          <figcaption>
            <a href={src.url} target="_blank" rel="noopener noreferrer">View the post ↗</a>
            <span>Their post started this thesis. They didn&rsquo;t pick these holdings.</span>
          </figcaption>
        </figure>
      ) : (
        <p className="tmw-voice-none">Written by {a.authorName}</p>
      )}
      <h2 className="tmw-claim">{a.claim}</h2>
      <p className="tmw-summary">{a.summary}</p>
      <details className="tmw-case">
        <summary>Read the full case <ChevronDown size={15} aria-hidden="true" /></summary>
        <h3>The case</h3>
        <p>{a.rationale}</p>
        <h3>The case against</h3>
        <p>{a.counterargument}</p>
        <h3>What would change the call</h3>
        <p>{a.changeMyMind}</p>
        <TakeASide thesisId={a.thesisId} claim={a.claim} />
        <p className="tma-disclosure">{a.authorDisclosure}</p>
      </details>
    </section>
  );
}

function Argument({ argument: a }: { argument: TerminalBasket["arguments"][number] }) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`tma ${open ? "is-open" : ""}`}>
      <button type="button" className="tma-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {/* ThesisAuthor, not AuthorMark directly: an editorial thesis has no handle, and passing
            the author's *name* as one asks for /authors/Thesis editorial.webp and renders a broken
            image. ThesisAuthor falls back to the brand mark, which is also the honest answer —
            the desk wrote it, and borrowing a face for it would be the one lie to avoid. */}
        <ThesisAuthor author={{ name: a.authorName, handle: a.authorHandle }} size="sm" />
        <span className="tma-title">
          <strong>{a.claim}</strong>
          <span>
            {a.role === "origin" && <em>built this allocation · </em>}
            {a.publishedAt
              ? new Date(a.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
              : "unpublished"}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="tma-chev" />
      </button>

      {open && (
        <div className="tma-body">
          <p className="tma-summary">{a.summary}</p>
          <h3>The case</h3>
          <p>{a.rationale}</p>
          <h3>The case against</h3>
          <p>{a.counterargument}</p>
          <h3>What would change their mind</h3>
          <p>{a.changeMyMind}</p>
          {/* Conviction stays with the argument it is about, not with the basket. Several people
              arguing for one allocation can be right and wrong separately, and a single
              backing/doubting count over the basket would average away the disagreement that is
              the reason the basket has more than one argument. It is free and needs no wallet. */}
          <TakeASide thesisId={a.thesisId} claim={a.claim} />
          <p className="tma-disclosure">{a.authorDisclosure}</p>
        </div>
      )}
    </article>
  );
}
