"use client";

import type { Judged, Telemetry } from "./types";

/**
 * The decision board.
 *
 * Every figure on it came back from the relevance provider while the reader was looking at it: the
 * token counts are its own reported usage, the milliseconds are a measured round trip, and the
 * three direction figures are the distribution it returned for that basket. Nothing here is
 * derived, smoothed or extrapolated, and no counter exists to look busy.
 *
 * `same / opposite / unclear` is why this page can be trusted with a bearish post: it is where you
 * can see, per basket, that the question "which way does this point?" was asked and answered.
 *
 * The provider is not named anywhere on screen. Which model scores relevance is infrastructure —
 * it can change without the reader's understanding of this panel changing.
 */
export function DecisionPanel({
  roster,
  judged,
  telemetry,
  running,
}: {
  roster: { slug: string; name: string }[];
  judged: Map<string, Judged>;
  telemetry: Telemetry | null;
  running: boolean;
}) {
  const done = roster.filter((r) => judged.has(r.slug)).length;

  return (
    <section className="hm-dec" aria-live="polite">
      <div className="hm-dec-head">
        <span className="hm-k">Relevance pass</span>
        <span className={`hm-dec-state${running ? " is-live" : ""}`}>
          {running ? "SCORING" : done ? "COMPLETE" : "IDLE"}
        </span>
      </div>

      <ol className="hm-dec-rows" role="list">
        {roster.map((r) => {
          const j = judged.get(r.slug);
          return (
            <li key={r.slug} className={`hm-dec-row${j ? " is-done" : ""}`}>
              <span className="hm-dec-name">{r.name}</span>
              {j ? (
                <>
                  <span className="hm-dec-dist" aria-label={`same ${pct(j.direction.same)}, opposite ${pct(j.direction.opposite)}, unclear ${pct(j.direction.unclear)}`}>
                    <i className="hm-dec-seg hm-dec-seg--same" style={{ flexGrow: Math.max(j.direction.same, 0.001) }} />
                    <i className="hm-dec-seg hm-dec-seg--opp" style={{ flexGrow: Math.max(j.direction.opposite, 0.001) }} />
                    <i className="hm-dec-seg hm-dec-seg--unc" style={{ flexGrow: Math.max(j.direction.unclear, 0.001) }} />
                  </span>
                  <span className={`hm-dec-choice hm-dec-choice--${j.direction.choice}`}>
                    {j.direction.choice.toUpperCase()}
                  </span>
                  <span className="hm-dec-num ln-num">{j.bar.toFixed(2)}</span>
                </>
              ) : (
                <span className="hm-dec-wait" aria-label="not scored yet">
                  <i />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* No provider name and no model id: that is infrastructure, not something a reader of this
          page needs. What stays is measurement — how much was scored, what it cost, how long. */}
      <dl className="hm-tel">
        <Row k="Scored" v={`${done} / ${roster.length}`} />
        <Row k="Questions" v={telemetry ? String(telemetry.questions) : "—"} />
        <Row k="Input tokens" v={telemetry ? telemetry.inputTokens.toLocaleString("en-GB") : "—"} />
        <Row k="Provider time" v={telemetry ? `${telemetry.providerMs} ms` : "—"} />
        <Row k="Batches" v={telemetry ? String(telemetry.batches) : "—"} />
      </dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className="ln-num">{v}</dd>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
