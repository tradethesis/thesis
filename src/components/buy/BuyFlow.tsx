"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Loader2 } from "lucide-react";
import { GIFT_MIN_USD } from "@/lib/gifts";
import { MAX_WEIGHT_BPS, MIN_WEIGHT_BPS } from "@/lib/money/allocate";
import { DEFAULT_BASKET_RAW, MIN_BASKET_RAW, estimateLegCost, formatUsdc } from "@/lib/money/cost";
import { base64ToBytes, bytesToBase64, signWithPhantom } from "@/lib/wallet/transaction";
import { usePrivySigner } from "@/lib/wallet/privy-signer";
import { getPhantom } from "@/lib/wallet/phantom";
import { useWallet } from "./useWallet";
import { TokenLogo } from "../calls/TokenLogo";
import { GiftSignIn, SignIn } from "./SignIn";

/**
 * Screens C, D and E from the PRD, in one client component because they are one decision:
 * how much, of what, and then watching it happen.
 *
 * The rule that shapes all of it: nothing here ever claims more than the server has
 * confirmed. No global success until every leg is confirmed, and a partial basket states
 * the unspent amount and says where it is.
 */

type Holding = { symbol: string; company: string; role: string; weightBps: number };

type Leg = {
  id: string;
  symbol: string;
  company: string;
  decimals: number;
  status: string;
  plannedInRaw: string;
  quoteOutRaw: string | null;
  quoteMinOutRaw: string | null;
  quoteRouter: string | null;
  quoteGasless: boolean | null;
  quoteFeeBps: number | null;
  errorDetail: string | null;
  fill: { outRaw: string; signature: string; amountSource: string } | null;
};

type Intent = {
  id: string;
  thesisVersionId: string;
  status: string;
  executionMode: "live" | "simulation";
  budgetRaw: string;
  spentRaw: string;
  unspentRaw: string;
  frozen: { frozen: boolean; reason?: string };
  canCancel: { ok: boolean; reason?: string };
  legs: Leg[];
};

const MIN_W = MIN_WEIGHT_BPS / 100;
const MAX_W = MAX_WEIGHT_BPS / 100;
const MIN_USD = Number(MIN_BASKET_RAW) / 1e6;

class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly detail?: Record<string, unknown>) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message ?? `request failed (${res.status})`, body?.error?.code, body?.error?.detail);
  return body as T;
}

function tokens(raw: string | null, decimals: number): string {
  if (!raw) return "—";
  const v = Number(BigInt(raw)) / 10 ** decimals;
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/**
 * `gift`: this purchase opens a funded gift. The amount comes from the server's gift record and the
 * allocation is the pack's, so neither is editable here; the purchase is attached to the gift's
 * reservation before anything is quoted, and delivery is settled from the intent's reconciled status.
 */
export function BuyFlow({ slug, claim, holdings, versionId, initialWeights, callStatement, initialNotice, authorName = "Thesis editorial", gift }: { slug: string; claim: string; holdings: Holding[]; versionId: string; initialWeights?: number[]; callStatement?: string; initialNotice?: string; authorName?: string; gift?: { token: string; amountUsd: number } }) {
  const w = useWallet();
  const privy = usePrivySigner();
  const [budget, setBudget] = useState(gift ? gift.amountUsd : Number(DEFAULT_BASKET_RAW) / 1e6);
  const [weights, setWeights] = useState(initialWeights ?? holdings.map((h) => h.weightBps / 100));
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [restoring, setRestoring] = useState(false);
  const [customizing, setCustomizing] = useState(Boolean(initialWeights));
  const [inProgressId, setInProgressId] = useState<string | null>(null);

  const authorWeights = useMemo(() => holdings.map((h) => h.weightBps / 100), [holdings]);
  const total = weights.reduce((a, b) => a + b, 0);
  const remainder = 100 - total;
  const edited = weights.some((x, i) => x !== authorWeights[i]);
  const validBudget = Number.isFinite(budget) && budget >= 0 && budget <= 1_000_000;
  const budgetRaw = validBudget ? BigInt(Math.round(budget * 1e6)) : 0n;
  const costRaw = weights.reduce(
    (sum, weight) => sum + estimateLegCost((budgetRaw * BigInt(weight)) / 100n).estimatedCostRaw,
    0n,
  );

  // A gift's floor is the gift minimum; the server re-checks it against the gift record.
  const belowMin = budget < (gift ? GIFT_MIN_USD : MIN_USD);
  const canReview = w.wallet !== null && total === 100 && !belowMin && validBudget && !restoring;

  // The server still authorizes every read. This key only restores the user's own progress.
  const storageKey = w.wallet ? "thesis.buy." + w.wallet + "." + slug : null;
  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    let id: string | null = null;
    try { id = localStorage.getItem(storageKey); } catch {}
    if (!id) return;
    setRestoring(true);
    api<Intent>(`/api/intents/${id}`).then(next => {
      if (active && next.thesisVersionId === versionId && next.status !== "cancelled") setIntent(next);
    }).catch(() => {}).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [storageKey, versionId]);
  useEffect(() => {
    if (!storageKey || !intent) return;
    try { localStorage.setItem(storageKey, intent.id); } catch {}
  }, [intent, storageKey]);
  useEffect(() => {
    if (!intent || !["executing", "needs_reconciliation"].includes(intent.status) || busy) return;
    let active = true;
    const timer = setInterval(() => { api<Intent>(`/api/intents/${intent.id}`).then(next => { if (active) setIntent(next); }).catch(() => {}); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [intent, busy]);

  const settledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!gift || !intent || !["complete", "partial", "cancelled"].includes(intent.status)) return;
    if (settledFor.current === intent.id + intent.status) return;
    settledFor.current = intent.id + intent.status;
    void fetch(`/api/gifts/invite/${encodeURIComponent(gift.token)}/settle`, { method: "POST" }).catch(() => {});
  }, [gift, intent]);

  const refresh = useCallback(async (id: string) => {
    const next = await api<Intent>(`/api/intents/${id}`);
    setIntent(next);
    return next;
  }, []);

  const review = useCallback(async () => {
    setError(null);
    setBusy("quoting");
    try {
      const created = await api<Intent>("/api/intents", {
        method: "POST",
        body: JSON.stringify({
          slug,
          versionId,
          budgetUsdc: budget,
          idempotencyKey: crypto.randomUUID(),
          weights: holdings.map((h, i) => ({ symbol: h.symbol, weightBps: Math.round(weights[i] * 100) })),
          ...(gift ? { giftToken: gift.token } : {}),
        }),
      });
      setIntent(created);
      if (gift) {
        // Reserve-then-transfer: bind this purchase to the gift before anything is quoted. If it
        // cannot be bound — wrong wallet, wrong allocation, reservation gone — nothing proceeds.
        const attached = await api<{ status: string }>(`/api/gifts/invite/${encodeURIComponent(gift.token)}/deliver`, {
          method: "POST",
          headers: { "idempotency-key": `deliver-${created.id}` },
          body: JSON.stringify({ intentId: created.id }),
        });
        if (attached.status !== "delivering") {
          await api(`/api/intents/${created.id}/cancel`, { method: "POST" }).catch(() => {});
          setIntent(null);
          throw new Error("This purchase couldn't be attached to your gift. Nothing was bought. Open the gift again from its invitation.");
        }
      }
      setIntent(await api<Intent>(`/api/intents/${created.id}/quote`, { method: "POST" }));
    } catch (e) {
      // A basket already in progress is a dead end unless we offer the way back to it.
      if (e instanceof ApiError && e.code === "basket_in_progress") {
        setInProgressId(typeof e.detail?.intentId === "string" ? e.detail.intentId : null);
      }
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [slug, budget, weights, holdings, versionId, gift]);

  // A gift has nothing to choose: once the gift's wallet is signed in, prepare the purchase for them
  // (once) so the next thing they see is the single "Approve and open".
  const autoReviewed = useRef(false);
  useEffect(() => {
    if (!gift || autoReviewed.current || intent || !canReview || busy !== null) return;
    autoReviewed.current = true;
    void review();
  }, [gift, intent, canReview, busy, review]);

  /** Legs run one at a time. Three approvals is the PRD's deliberate choice, not an accident. */
  const buy = useCallback(async () => {
    if (!intent) return;
    setError(null);
    setNotice(null);

    for (const leg of intent.legs) {
      if (leg.status === "confirmed") continue;
      setBusy(leg.id);
      try {
        if (intent.executionMode === "simulation") {
          await api(`/api/intents/${intent.id}/legs/${leg.id}/simulate`, { method: "POST" });
          await refresh(intent.id);
          continue;
        }

        const prepared = await api<{ outcome: string; transactionB64?: string; message?: string; symbol: string }>(
          `/api/intents/${intent.id}/legs/${leg.id}/prepare`,
          { method: "POST" },
        );
        if (prepared.outcome === "terms_changed") {
          setNotice(`${prepared.symbol}: ${prepared.message}`);
          await refresh(intent.id);
          break;
        }

        // Sign with whichever wallet this session is: the embedded wallet a gift was sent to (signed
        // in with X or email), or Phantom. Either way the server sends it, and verifies the signer.
        let signed: string;
        if (privy?.signTransaction && privy.address && privy.address === w.wallet) {
          signed = bytesToBase64(await privy.signTransaction(base64ToBytes(prepared.transactionB64!)));
        } else {
          const provider = getPhantom();
          if (!provider) throw new Error("Your wallet isn't available. Sign in again and retry.");
          signed = await signWithPhantom(prepared.transactionB64!, provider);
        }

        await api(`/api/intents/${intent.id}/legs/${leg.id}/execute`, {
          method: "POST",
          body: JSON.stringify({ signedTransaction: signed }),
        });
        const next = await refresh(intent.id);
        if (next.frozen.frozen || next.legs.find(l => l.id === leg.id)?.status !== "confirmed") break;
      } catch (e) {
        setError((e as Error).message);
        await refresh(intent.id).catch(() => {});
        break; // stop the basket; the legs already filled stay filled
      } finally {
        setBusy(null);
      }
    }
  }, [intent, refresh, privy, w.wallet]);

  const cancel = useCallback(async () => {
    if (!intent) return;
    setBusy("cancel");
    try {
      setIntent(await api<Intent>(`/api/intents/${intent.id}/cancel`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [intent]);

  /* ------------------------------------------------------------- progress */

  if (intent && (intent.status === "executing" || intent.status === "partial" || intent.status === "complete" || intent.status === "needs_reconciliation")) {
    const confirmed = intent.legs.filter((l) => l.status === "confirmed").length;
    const done = intent.status === "complete";

    return (
      <div className="by-panel">
        <header className="by-progress-head">
          <h2 className="by-h2">
            {done
              ? "All three purchased."
              : intent.status === "needs_reconciliation"
                ? "Checking the chain."
                : `${confirmed} of ${intent.legs.length} purchased.`}
          </h2>
          {/* A gift's pack is torn open on its own page, over holdings the chain has confirmed —
              never here, where it would be a progress animation over a purchase still in flight. */}
          {gift && (done || intent.status === "partial") && (
            <>
              <GiftOnward token={gift.token} />
              <a className="ln-btn ln-btn--ink" href={`/gift/${encodeURIComponent(gift.token)}`}>Open your pack →</a>
            </>
          )}
          {!done && intent.status !== "needs_reconciliation" && BigInt(intent.unspentRaw) > 0n && (
            <p className="by-unspent">
              {formatUsdc(BigInt(intent.unspentRaw))} was not spent. It is still in your wallet — we never hold it.
            </p>
          )}
          {intent.status === "needs_reconciliation" && (
            <p className="by-unspent">
              A transaction may still be landing. Nothing more will be signed until we know what happened to it.
            </p>
          )}
        </header>

        <ul className="by-legs">
          {intent.legs.map((leg) => (
            <li key={leg.id} className="by-leg">
              <span className={`by-dot by-dot--${leg.status}`} aria-hidden="true" />
              <span className="by-leg-name">
                <strong>{leg.symbol}</strong>
                <span className="by-leg-company">{leg.company}</span>
              </span>
              <span className="by-leg-in">{formatUsdc(BigInt(leg.plannedInRaw))}</span>
              <span className="by-leg-status">
                {leg.status === "confirmed"
                  ? `${tokens(leg.fill?.outRaw ?? null, leg.decimals)} ${leg.symbol}`
                  : leg.status === "awaiting_signature"
                    ? "Waiting for your approval"
                    : leg.status === "submitted"
                      ? "Submitted"
                      : leg.status === "unknown"
                        ? "Checking"
                        : leg.status === "failed" || leg.status === "expired"
                          ? (leg.errorDetail ?? "Did not go through")
                          : busy === leg.id
                            ? "Working"
                            : "Not started"}
              </span>
            </li>
          ))}
        </ul>

        {intent.executionMode === "simulation" && (
          <p className="by-sim">
            Simulation. Real prices and a real basket, but no signature was requested and nothing was sent to the
            chain.
          </p>
        )}
        {notice && <p className="by-notice">{notice}</p>}
        {error && <p className="by-error">{error}</p>}

        <div className="by-actions">
          {!done && (
            <button className="ln-btn ln-btn--ink" onClick={buy} disabled={busy !== null || intent.frozen.frozen}>
              {busy ? <Loader2 size={16} className="by-spin" aria-hidden="true" /> : null}
              Resume remaining purchases
            </button>
          )}
          {!done && intent.canCancel.ok && (
            <button className="ln-btn ln-btn--secondary" onClick={cancel} disabled={busy !== null}>
              Keep what I have
            </button>
          )}
          <Link href={`/t/${slug}`} className="ln-btn ln-btn--secondary">
            Back to the thesis
          </Link>
        </div>
        {intent.frozen.frozen && <p className="by-frozen">{intent.frozen.reason}</p>}
      </div>
    );
  }

  /* --------------------------------------------------------------- review */

  if (intent && intent.status === "ready") {
    const feeBps = intent.legs.reduce((m, l) => Math.max(m, l.quoteFeeBps ?? 0), 0);
    const allGasless = intent.legs.every((l) => l.quoteGasless);

    return (
      <div className="by-panel">
        {!gift && (
          <button className="by-back" onClick={() => setIntent(null)}>
            <ArrowLeft size={14} aria-hidden="true" /> Change the allocation
          </button>
        )}
        <h2 className="by-h2">{gift ? "One tap to open it." : "Review, then buy."}</h2>
        {gift && <p className="by-hint">Swap fees of about {formatUsdc(costRaw)} come out of the gift. Nothing else is charged to you.</p>}

        <Sealed sealed={Boolean(gift)}>
        <ul className="by-review">
          {intent.legs.map((leg) => (
            <li key={leg.id}>
              <div className="by-review-top">
                <strong>{leg.symbol}</strong>
                <span>{formatUsdc(BigInt(leg.plannedInRaw))}</span>
              </div>
              <div className="by-review-detail">
                <span>About {tokens(leg.quoteOutRaw, leg.decimals)}</span>
                <span>At least {tokens(leg.quoteMinOutRaw, leg.decimals)}</span>
              </div>
            </li>
          ))}
        </ul>

        <dl className="by-costs">
          <div>
            <dt>You pay</dt>
            <dd>{formatUsdc(BigInt(intent.budgetRaw))} USDC</dd>
          </div>
          <div>
            <dt>Jupiter&rsquo;s fee</dt>
            <dd>up to {(feeBps / 100).toFixed(2)}% · paid to Jupiter, not to us</dd>
          </div>
          <div>
            <dt>Network cost</dt>
            <dd>{allGasless ? "None — Jupiter covers it. You need no SOL." : "Paid from your SOL"}</dd>
          </div>
        </dl>
        </Sealed>

        <p className="by-approvals">
          <strong>{gift ? "Your wallet confirms it" : `${intent.legs.length} purchases.`}</strong>{" "}
          {gift
            ? `— ${intent.legs.length === 1 ? "one quick approval" : `${intent.legs.length} quick approvals, one per holding`}.`
            : intent.executionMode === "live"
            ? "Your wallet will ask you to approve each one."
            : "This basket is in simulation, so no approval will be requested."}
        </p>

        {error && <p className="by-error">{error}</p>}

        <div className="by-actions">
          <button className="ln-btn ln-btn--ink" onClick={buy} disabled={busy !== null}>
            {busy ? <Loader2 size={16} className="by-spin" aria-hidden="true" /> : null}
            {gift ? "Approve and open" : intent.executionMode === "live" ? "Review and buy" : "Run the simulation"}
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ allocation */

  return (
    <div className="by-panel">
      <div className="by-head">
        <p className="by-eyebrow">{gift ? "Your gift" : "Back this thesis"}</p>
        <h1 className="by-title">{gift ? "Ready to open." : claim}</h1>
        {gift && <p className="by-hint">Approve once and the pack is bought into your wallet. Then you tear it open.</p>}
      </div>

      {notice && <p className="by-notice" role="status">{notice}</p>}

      <Sealed sealed={Boolean(gift)}>
      <label className="by-budget">
        <span>Amount in USDC</span>
        <input
          type="number"
          inputMode="decimal"
          min={MIN_USD}
          max={1_000_000}
          step={25}
          value={budget}
          readOnly={Boolean(gift)}
          aria-describedby={gift ? "by-gift-amount" : undefined}
          onChange={(e) => setBudget(Number(e.target.value))}
        />
      </label>
      {belowMin && (
        <p className="by-hint by-hint--warn">
          The minimum is ${MIN_USD}. Below that, fees are a large share of what you put in.
        </p>
      )}
      {!validBudget && <p className="by-error" role="alert">Enter an amount between $75 and $1,000,000.</p>}

      <div className="by-allocation-head"><span>{edited ? "Your allocation" : `${authorName}’s allocation`}</span>{/* Custom weights use the three-holding bounds; one- and two-holding baskets buy as published. */}{!gift && holdings.length === 3 && <button type="button" className="by-customize" aria-expanded={customizing} aria-controls={`weights-${slug}`} onClick={() => setCustomizing(!customizing)}>{customizing ? "Done customizing" : "Customize allocation"}</button>}</div>
      {gift && <p className="by-hint" id="by-gift-amount">This is your gift: the amount is what was sent to you, and the pack opens as it was chosen for you.</p>}
      <ul className={`by-weights${customizing ? "" : " by-weights--summary"}`} id={`weights-${slug}`}>
        {holdings.map((h, i) => {
          const legRaw = (budgetRaw * BigInt(weights[i])) / 100n;
          return (
            <li key={h.symbol}>
              <div className="by-weight-top">
                <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
                <span className="by-weight-name">
                  <strong>{h.symbol}</strong>
                  <span className="by-leg-company">{h.company} · {h.role}</span>
                </span>
                <span className="by-weight-figures">
                  <strong>{weights[i]}%</strong>
                  <span>{formatUsdc(legRaw)}</span>
                </span>
              </div>
              {customizing && <input
                type="range"
                min={MIN_W}
                max={MAX_W}
                step={1}
                value={weights[i]}
                aria-label={`${h.company} weight, percent`}
                onChange={(e) => setWeights((c) => c.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              />}
            </li>
          );
        })}
      </ul>

      <p className={`by-hint${remainder !== 0 ? " by-hint--warn" : ""}`} role="status">
        {remainder === 0
          ? edited
            ? `Totals 100%. Your allocation differs from ${authorName}’s.`
            : "Totals 100%. Ready to review."
          : remainder > 0
            ? `${remainder}% still to allocate.`
            : `${-remainder}% over. Reduce one of the holdings.`}
        {edited && (
          <button className="by-reset" onClick={() => setWeights(authorWeights)}>
            Reset to {authorName}’s weights
          </button>
        )}
      </p>
      </Sealed>

      {callStatement && <details className="by-call-details"><summary>The timed call</summary><p>{callStatement}</p><p>Your investment starts at your own entry price. The deadline does not sell your holdings.</p></details>}
      <p className="by-est">
        {gift ? <>Swap fees of about {formatUsdc(costRaw)} come out of the gift. Jupiter charges them; Thesis adds nothing.</> : <>Estimated cost {formatUsdc(costRaw)} on {formatUsdc(budgetRaw)}. Jupiter charges it; Thesis adds nothing.</>}
      </p>

      {!w.wallet ? (
        gift ? <GiftSignIn wallet={w} token={gift.token} /> : <SignIn wallet={w} />
      ) : (
        <div className="by-actions">
          <button className="ln-btn ln-btn--ink" onClick={review} disabled={!canReview || busy !== null}>
            {busy === "quoting" ? <Loader2 size={16} className="by-spin" aria-hidden="true" /> : null}
            {restoring ? "Restoring your basket…" : gift ? "Open my gift" : "Review whole basket"}
          </button>
          <span className="by-connected">
            <Check size={13} aria-hidden="true" />
            {w.wallet.slice(0, 4)}…{w.wallet.slice(-4)}
            {/* A gift's purchase has its own mode (giftExecutionMode); the session's would mislead here. */}
            {!gift && w.executionMode === "simulation" && " · practice mode"}
          </span>
        </div>
      )}

      {(error || w.error) && (
        <p className="by-error">
          <CircleAlert size={14} aria-hidden="true" /> {error ?? w.error}
        </p>
      )}
      {inProgressId && (
        <div className="by-actions">
          <button
            className="ln-btn ln-btn--secondary"
            onClick={async () => {
              setError(null);
              setInProgressId(null);
              try {
                setIntent(await api<Intent>(`/api/intents/${inProgressId}`));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Open the basket I already have
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A gift's contents, folded away. The amount and the holdings are what the recipient finds when they
 * tear the pack; showing them here, a step before, would spoil it. Anyone who wants to check first can
 * open the fold — nothing is hidden that the purchase depends on, and the review step still lists
 * every leg before anything is signed.
 */
function Sealed({ sealed, children }: { sealed: boolean; children: React.ReactNode }) {
  if (!sealed) return <>{children}</>;
  return (
    <details className="by-sealed">
      <summary>What&rsquo;s inside — this spoils the surprise</summary>
      {children}
    </details>
  );
}

/** Bought and confirmed: go straight to the tear, which waits on the gift's own page. */
function GiftOnward({ token }: { token: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.location.assign(`/gift/${encodeURIComponent(token)}`), 900);
    return () => clearTimeout(t);
  }, [token]);
  return null;
}
