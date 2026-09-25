"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

import { CATEGORIES, draftSchema, type ThesisDraftInput } from "@/lib/thesis-draft";
import { MAX_WEIGHT_BPS, MIN_WEIGHT_BPS } from "@/lib/money/allocate";

import { useWallet } from "../buy/useWallet";

/**
 * Writing a thesis, in four fields.
 *
 * The claim, the basket, why it works, why it might not — and nothing else. The per-holding
 * detail, the summary and the falsifier a published thesis carries are drafted from these on
 * the server and shown on the page that follows. A thirty-field form is a form nobody
 * finishes, and an empty catalogue is worse than a terse one.
 *
 * The case against is not optional and never will be. It is the one field that separates
 * this from a launchpad with a text box, and the author's own words for it are published
 * verbatim rather than passed through the model.
 *
 * Publishing is the whole flow. A thesis used to also launch a paired token on a bonding curve,
 * with the trading fee split to its author; that was removed on 22 September 2026. It promised
 * something the rest of the product does not — the token backed nothing and could not be redeemed
 * — and it was the only path here that spent real SOL. Writing is the supply side of the
 * catalogue and stays; the coin does not. Nothing was ever launched, so nothing was lost.
 */

type Asset = { symbol: string; company: string };
type Holding = { symbol: string; weightPercent: number };

/** Three holdings that already add up to 100%. A form should open in a valid state. */
const START: Holding[] = [
  { symbol: "", weightPercent: 34 },
  { symbol: "", weightPercent: 33 },
  { symbol: "", weightPercent: 33 },
];

type Stage =
  | { at: "writing" }
  | { at: "publishing" }
  | { at: "published"; slug: string; claim: string };

export function CreateThesis({ assets }: { assets: Asset[] }) {
  const { wallet, connect, connectWithEmail, hasPhantom, hasEmailSignIn, signingIn } = useWallet();

  const [claim, setClaim] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Technology");
  const [why, setWhy] = useState("");
  const [against, setAgainst] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>(START);

  const [stage, setStage] = useState<Stage>({ at: "writing" });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const total = holdings.reduce((sum, h) => sum + h.weightPercent, 0);
  const busy = stage.at === "publishing";

  const setHolding = (i: number, patch: Partial<Holding>) =>
    setHoldings((prev) => prev.map((h, n) => (n === i ? { ...h, ...patch } : h)));

  async function publish() {
    setFailure(null);
    setIssues({});

    const draft: ThesisDraftInput = { claim, category, why, against, holdings } as ThesisDraftInput;
    const local = draftSchema.safeParse(draft);
    if (!local.success) {
      setIssues(Object.fromEntries(local.error.issues.map((i) => [i.path.join("."), i.message])));
      setFailure("Some fields still need work.");
      return;
    }

    setStage({ at: "publishing" });
    let slug: string;
    try {
      const res = await fetch("/api/thesis/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(local.data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = body?.error?.detail?.issues as { path: string; message: string }[] | undefined;
        if (detail) setIssues(Object.fromEntries(detail.map((i) => [i.path, i.message])));
        setFailure(body?.error?.message ?? "That could not be published.");
        setStage({ at: "writing" });
        return;
      }
      slug = body.slug as string;
    } catch {
      setFailure("That could not be published. Check your connection and try again.");
      setStage({ at: "writing" });
      return;
    }

    setStage({ at: "published", slug, claim });
  }

  if (stage.at === "published") {
    return (
      <section className="cr-done">
        <h2>{stage.claim}</h2>
        <p className="cr-live">Your thesis is live.</p>
        <p className="cr-quiet">
          It is in the terminal now, and anybody can buy its basket. The holdings are bought into the buyer&rsquo;s
          own wallet — you are not holding anything for them.
        </p>
        <div className="cr-done-actions">
          <Link href={`/t/${stage.slug}`} className="ln-btn ln-btn--ink">
            See it
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="cr">
      {!wallet && (
        <div className="cr-gate" role="status">
          <p>
            <strong>Sign in first.</strong> A thesis needs a wallet behind it — that is who gets the byline.
          </p>
          <div className="cr-gate-actions">
            <button type="button" className="ln-btn ln-btn--ink" onClick={connect} disabled={signingIn}>
              {hasPhantom ? "Connect wallet" : "Get started"}
            </button>
            {hasEmailSignIn && (
              <button type="button" className="ln-btn ln-btn--secondary" onClick={connectWithEmail} disabled={signingIn}>
                Continue with email
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`cr-field ${issues.claim ? "is-bad" : ""}`}>
        <label className="cr-label" htmlFor="cr-claim">
          The claim
        </label>
        {/* The category shares this row rather than earning one of its own. It is a filing
            decision, not part of the argument, and a form this short cannot spare a line
            for something nobody thinks about. */}
        <div className="cr-claim-row">
          <input
            id="cr-claim"
            type="text"
            value={claim}
            maxLength={70}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="The toll booths outlast the traffic"
            disabled={busy}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            aria-label="Category"
            disabled={busy}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {issues.claim && <Problem>{issues.claim}</Problem>}
      </div>

      <div className="cr-basket">
        <div className="cr-basket-head">
          <span className="cr-label">The basket</span>
          <span className={`cr-total ${total === 100 ? "is-ok" : "is-off"}`}>
            <strong className="ln-num">{total}%</strong>
          </span>
        </div>
        {holdings.map((h, i) => (
          <div className="cr-pick" key={i}>
            <select
              value={h.symbol}
              onChange={(e) => setHolding(i, { symbol: e.target.value })}
              aria-label={`Holding ${i + 1}`}
              disabled={busy}
            >
              <option value="">Pick an asset…</option>
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.company}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={MIN_WEIGHT_BPS / 100}
              max={MAX_WEIGHT_BPS / 100}
              step={1}
              value={h.weightPercent}
              onChange={(e) => setHolding(i, { weightPercent: Number(e.target.value) })}
              aria-label={`Weight for holding ${i + 1}`}
              disabled={busy}
            />
            <span className="cr-pct ln-num">{h.weightPercent}%</span>
          </div>
        ))}
        {issues.holdings && <Problem>{issues.holdings}</Problem>}
        <span className="cr-hint">
          Three holdings, each {MIN_WEIGHT_BPS / 100}–{MAX_WEIGHT_BPS / 100}%, adding to 100.
        </span>
      </div>

      <label className={`cr-field ${issues.why ? "is-bad" : ""}`}>
        <span className="cr-label">Why this is right</span>
        <textarea value={why} rows={4} maxLength={1200} onChange={(e) => setWhy(e.target.value)} disabled={busy} />
        {issues.why && <Problem>{issues.why}</Problem>}
      </label>

      <label className={`cr-field ${issues.against ? "is-bad" : ""}`}>
        <span className="cr-label">Why it might not be</span>
        <span className="cr-hint">
          The strongest honest case against you. Every thesis here has one — it is the reason anybody believes
          the rest.
        </span>
        <textarea
          value={against}
          rows={3}
          maxLength={1200}
          onChange={(e) => setAgainst(e.target.value)}
          disabled={busy}
        />
        {issues.against && <Problem>{issues.against}</Problem>}
      </label>

      <div className="cr-submit">
        {failure && <Problem>{failure}</Problem>}
        <button type="button" className="ln-btn ln-btn--ink" onClick={publish} disabled={busy || !wallet}>
          {stage.at === "publishing" ? (
            <>
              <Loader2 size={14} className="cr-spin" aria-hidden="true" /> Writing it up…
            </>
          ) : wallet ? (
            "Publish"
          ) : (
            "Sign in to publish"
          )}
        </button>
        <span className="cr-quiet">
          Publishes straight away. The rest of the write-up — the summary, the per-holding reasoning and the
          falsifier — is drafted from what you wrote above, and your words for the case against are published
          verbatim.
        </span>
      </div>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <span className="cr-problem" role="alert">
      <AlertCircle size={13} aria-hidden="true" />
      {children}
    </span>
  );
}
