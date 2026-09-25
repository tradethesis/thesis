"use client";

import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { BorderBeam } from "border-beam";
import { ThinkingOrb } from "thinking-orbs";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BrandMark } from "@/components/landing/BrandMark";

import { DecisionPanel } from "./DecisionPanel";
import { MatchList } from "./MatchList";
import { SelectedBasket } from "./SelectedBasket";
import type { Example, Judged, MatchEvent, MatchResponse, Telemetry } from "./types";

/**
 * See a trend. Find your basket.
 *
 * One input, one result surface, no marketing. A visitor pastes an X link or types an idea and sees
 * which reviewed baskets express it — before connecting anything. The wallet is asked for at the
 * point of buying, by the existing checkout.
 *
 * ## Why this streams
 *
 * The response arrives as newline-delimited JSON, one event per batch of baskets, and the board
 * fills as each real judgement lands. The movement on screen *is* the work: nothing is animated
 * into place ahead of its answer, and the counters in the decision panel are the provider's own
 * usage figures rather than a progress fiction.
 *
 * ## Two things it has to get right
 *
 * **A stale answer must never replace a fresh one.** Every submission takes a sequence number and
 * events are dropped unless they belong to the newest one. Without it a slow first search lands on
 * top of a fast second.
 *
 * **The reader must know which input produced what is on screen.** `answeredFor` is the exact text
 * that was sent, kept apart from the editable field, so editing never silently relabels results.
 *
 * The model is called on submit and never while typing.
 */

/** --ln-brand, oklch(70% 0.19 34), resolved to sRGB for a canvas-drawn component. */
const BRAND = "#fe6847";

type Stage =
  | { at: "idle" }
  | { at: "working"; step: "reading" | "matching" }
  | { at: "done"; result: MatchResponse }
  | { at: "failed"; message: string };

export function Home({
  examples,
  terminalHref,
  basketCount,
}: {
  examples: Example[];
  terminalHref: string;
  basketCount: number;
}) {
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>({ at: "idle" });
  const [selected, setSelected] = useState("");
  const [answeredFor, setAnsweredFor] = useState("");
  const [showScore, setShowScore] = useState(false);

  // Live scoring state, replaced wholesale per submission.
  const [roster, setRoster] = useState<{ slug: string; name: string }[]>([]);
  const [judged, setJudged] = useState<Map<string, Judged>>(new Map());
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  const [compareOpen, setCompareOpen] = useState(true);
  useEffect(() => {
    setCompareOpen(window.matchMedia("(min-width: 900px)").matches);
  }, []);

  /*
   * Both borrowed effects are motion, so both stop when the reader has asked for less of it. The
   * beam takes `active` and the orb takes `paused`; neither has a CSS surface this page can reach,
   * so the preference is read once and passed down.
   */
  const [stillness, setStillness] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStillness(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);

  const seq = useRef(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  const submit = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) {
      setStage({ at: "failed", message: "Paste a link or describe the idea." });
      return;
    }
    const mine = ++seq.current;
    setShowScore(false);
    setRoster([]);
    setJudged(new Map());
    setTelemetry(null);
    // Reading a post is a real, visible step; saying "matching" while fetching would be a lie.
    setStage({ at: "working", step: /^https?:\/\/\S+$/i.test(text) ? "reading" : "matching" });

    const tel: Telemetry = { model: "", batches: 0, candidates: 0, questions: 0, inputTokens: 0, outputTokens: 0, providerMs: 0 };
    const seenBatches = new Set<string>();

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        if (mine !== seq.current) return;
        setAnsweredFor(text);
        setStage({ at: "done", result: { status: "error", query: text, message: json?.error?.message ?? "Matching failed. Try again." } });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (mine !== seq.current) { await reader.cancel(); return; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: MatchEvent;
          try { event = JSON.parse(line); } catch { continue; }
          if (mine !== seq.current) return;

          if (event.type === "started") {
            setRoster(event.candidates);
            setStage({ at: "working", step: "matching" });
          } else if (event.type === "scored") {
            setJudged((prev) => new Map(prev).set(event.slug, event.judged));
            /*
             * A batch's usage arrives once per basket in it, so adding it per event would count the
             * same tokens three times. Track which batches have been seen and add each once; the
             * final `done` event carries the server's own totals and replaces these anyway.
             */
            if (!seenBatches.has(event.usage.ms + ":" + event.usage.questions)) {
              seenBatches.add(event.usage.ms + ":" + event.usage.questions);
              tel.model = event.usage.model;
              tel.batches += 1;
              tel.questions += event.usage.questions;
              tel.candidates += event.usage.candidates;
              tel.inputTokens += event.usage.inputTokens;
              tel.outputTokens += event.usage.outputTokens;
              tel.providerMs += event.usage.ms;
            }
            setTelemetry({ ...tel });
          } else {
            setAnsweredFor(text);
            setStage({ at: "done", result: event.result });
            if (event.result.status === "ok") {
              setSelected(event.result.candidates[0]?.slug ?? "");
              if (event.result.telemetry) setTelemetry(event.result.telemetry);
            }
          }
        }
      }
    } catch {
      if (mine !== seq.current) return;
      setAnsweredFor(text);
      setStage({ at: "done", result: { status: "error", query: text, message: "Matching failed. Check your connection and try again." } });
    }
  }, []);

  const result = stage.at === "done" ? stage.result : null;
  const ok = result?.status === "ok" ? result : null;
  const candidate = ok?.candidates.find((c) => c.slug === selected) ?? ok?.candidates[0] ?? null;
  const edited = answeredFor !== "" && input.trim() !== answeredFor;
  const working = stage.at === "working";

  return (
    <div className="hm">
      <div className="hm-win">
        {/*
          * One header line, full width — the reference's `LAYA / LOCAL INTELLIGENCE` on the left
          * and its run state on the right, with a hairline under it. There is no window chrome:
          * the traffic lights in the reference screenshot belong to the operating system, not to
          * the application, and reproducing them would box a full-screen terminal inside a picture
          * of a browser.
          */}
        <header className="hm-head">
          <Link href="/" className="hm-mark" aria-label="Thesis">
            <BrandMark />
            <span>thesis</span>
            <span className="hm-mark-sub">/ match terminal</span>
          </Link>
          <nav className="hm-head-nav" aria-label="Sections">
            <span className="hm-head-count ln-num">{basketCount} reviewed</span>
            <Link href={terminalHref}>Explore terminal</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>

        <div className="hm-rule" role="presentation" />

        <section className="hm-search">
          <h1 className="hm-h1">See a trend. Find your basket.</h1>

          <label className="hm-sr" htmlFor={fieldId}>
            Paste an X link or describe your investment idea
          </label>
          {/*
            * The beam rides the border only while the stream is open. It is tied to real
            * outstanding work, not to focus or to a timer, so it is a status light rather than an
            * ornament: when it stops, the last batch has landed.
            */}
          <BorderBeam
            className="hm-beam"
            size="line"
            colorVariant="sunset"
            theme="dark"
            strength={0.55}
            active={working && !stillness}
          >
          <div className={`hm-bar${working ? " is-busy" : ""}`}>
            <textarea
              id={fieldId}
              ref={field}
              className="hm-field"
              value={input}
              rows={1}
              spellCheck={false}
              placeholder="Paste an X link or describe your idea…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter makes a newline, because pasted posts have them. Cmd/Ctrl+Enter submits.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit(input);
                }
              }}
            />
            {/*
              * Never disabled while a search runs.
              *
              * Submitting again supersedes the one in flight — the sequence guard already drops the
              * older answer — and that is the behaviour somebody reading a half-filled board wants.
              * Locking the control instead made the page hold a reader hostage to a request they
              * had already changed their mind about.
              */}
            <button
              type="button"
              className="hm-send"
              aria-label={working ? "Searching — press to search again" : "Find exposure"}
              onClick={() => void submit(input)}
            >
              {working ? (
                /* `searching` while a post is being fetched, `solving` while baskets are scored —
                   the orb says which of the two is happening rather than spinning either way. */
                <ThinkingOrb
                  state={stage.at === "working" && stage.step === "reading" ? "searching" : "solving"}
                  size={20}
                  theme="dark"
                  color={BRAND}
                  paused={stillness}
                  aria-hidden="true"
                />
              ) : (
                <ArrowUp size={17} aria-hidden="true" />
              )}
            </button>
          </div>
          </BorderBeam>

          <p className="hm-cap">
            <span className="hm-cap-dot" aria-hidden="true" />
            {basketCount} reviewed baskets indexed · <kbd>⌘</kbd><kbd>↵</kbd> to search
          </p>

          {stage.at === "done" && answeredFor && (
            <p className="hm-answered">
              <span className="hm-k">Results for</span>
              <span className="hm-answered-text">{clip(answeredFor)}</span>
              {edited && <span className="hm-answered-stale">edited — search again</span>}
            </p>
          )}
        </section>

        <div className="hm-rule" role="presentation" />

        <main className="hm-work" id="main">
          {stage.at === "idle" && (
            <section className="hm-empty">
              <p className="hm-k">Try one of these</p>
              <ul className="hm-examples" role="list">
                {/* Keyed by the idea: labels are basket categories and two baskets can share one. */}
                {examples.map((e) => (
                  <li key={e.idea}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(e.idea);
                        field.current?.focus();
                      }}
                    >
                      <span className="hm-ex-label">{e.label}</span>
                      <span className="hm-ex-idea">{e.idea}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hm-empty-note">
                Results appear here: the basket that best expresses your idea on the left, and how each
                candidate matches on the right. Nothing is bought, and no wallet is needed to look.
              </p>
            </section>
          )}

          {(working || (ok && roster.length > 0)) && (
            <div className="hm-live">
              {stage.at === "working" && stage.step === "reading" && (
                <p className="hm-working" role="status">Reading the post…</p>
              )}
              <DecisionPanel roster={roster} judged={judged} telemetry={telemetry} running={working} />
            </div>
          )}

          {stage.at === "failed" && <p className="hm-problem" role="alert">{stage.message}</p>}

          {result && result.status === "unretrievable" && (
            <p className="hm-problem" role="alert">{result.message}</p>
          )}

          {result && result.status === "unavailable" && (
            <div className="hm-problem" role="alert">
              <p>{result.message}</p>
              <p className="hm-problem-sub">
                {result.reason === "unconfigured"
                  ? "No relevance provider is configured here, so nothing can be matched. Rather than guess, this deployment shows you nothing."
                  : result.reason === "refused"
                    ? "Nothing was matched, and nothing is guessed in its place. Every thesis is still here to browse."
                    : "Nothing was matched. Try again in a moment, or browse the theses."}
              </p>
              <div className="hm-problem-actions">
                <Link href="/app" className="hm-btn">Browse all theses</Link>
                {result.reason !== "refused" && (
                  <button type="button" className="hm-btn hm-btn--quiet" onClick={() => void submit(answeredFor || input)}>
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          {result && result.status === "empty_catalogue" && (
            <p className="hm-problem" role="alert">There are no published baskets to match against yet.</p>
          )}

          {result && result.status === "error" && (
            <div className="hm-problem" role="alert">
              <p>{result.message}</p>
              <button type="button" className="hm-btn hm-btn--quiet" onClick={() => void submit(answeredFor || input)}>
                Try again
              </button>
            </div>
          )}

          {ok && ok.candidates.length === 0 && (
            <p className="hm-problem" role="status">{ok.noMatchNote ?? "No reviewed basket expresses this idea."}</p>
          )}

          {ok && candidate && (
            <div className="hm-split">
              <div className="hm-left">
                {ok.fixture && (
                  <p className="hm-flag" role="status">
                    Development fixtures — word-overlap placeholders, not matches.
                  </p>
                )}
                {ok.noMatch && <p className="hm-flag">{ok.noMatchNote}</p>}
                <SelectedBasket candidate={candidate} />
              </div>

              <aside className="hm-right" aria-label="How your idea matches">
                <details className="hm-compare" open={compareOpen} onToggle={(e) => setCompareOpen(e.currentTarget.open)}>
                  <summary>
                    Compare matches
                    <span className="hm-compare-count">{ok.candidates.length}</span>
                  </summary>
                  <p className="hm-k hm-compare-head">How your idea matches</p>
                  <MatchList candidates={ok.candidates} selected={candidate.slug} onSelect={setSelected} />

                  <div className="hm-why">
                    <p className="hm-k">Why it matches</p>
                    <p className="hm-why-text">{candidate.explanation.why}</p>
                    {candidate.explanation.misses && (
                      <>
                        <p className="hm-k">What it misses</p>
                        <p className="hm-why-text">{candidate.explanation.misses}</p>
                      </>
                    )}

                    {ok.source.kind === "post" && (
                      <p className="hm-source">
                        <span className="hm-k">Source</span>
                        <a href={ok.source.url} target="_blank" rel="noopener noreferrer nofollow">
                          {ok.source.handle}
                          {ok.source.authorName ? ` · ${ok.source.authorName}` : ""} ↗
                        </a>
                      </p>
                    )}

                    <button type="button" className="hm-disclose" aria-expanded={showScore} onClick={() => setShowScore(!showScore)}>
                      About this match
                    </button>
                    {showScore && (
                      <div className="hm-about">
                        <p>
                          These bars describe how closely a basket&rsquo;s reviewed investment case
                          expresses your idea, including its direction. They are <strong>not</strong> a
                          probability of profit, an expected return, a safety rating, or a suggested
                          position size.
                        </p>
                        <p>
                          Each basket is judged on its own, so several can match one idea and the bars
                          are not shares of anything.
                        </p>
                        <dl className="hm-scores">
                          {ok.candidates.map((c) => (
                            <div key={c.slug}>
                              <dt>{c.name}</dt>
                              <dd className="ln-num">{c.bar.toFixed(2)}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="hm-about-warn">
                          Unvalidated model estimate of relevance on a 0–1 scale. It has not been
                          checked against any outcome and is not calibrated.
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              </aside>
            </div>
          )}
        </main>

        <div className="hm-rule" role="presentation" />
        <footer className="hm-foot">
          <span>⌘↵ search · click a row to switch basket</span>
          <span className="hm-foot-right">
            {basketCount} reviewed baskets · scored per search
          </span>
        </footer>
      </div>
    </div>
  );
}

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 150 ? `${one.slice(0, 150)}…` : one;
}
