"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Loader2, Wallet } from "lucide-react";
import { MAX_WEIGHT_BPS, MIN_WEIGHT_BPS } from "@/lib/money/allocate";
import { DEFAULT_BASKET_RAW, MIN_BASKET_RAW, estimateLegCost, formatUsdc } from "@/lib/money/cost";
import { signWithPhantom } from "@/lib/wallet/transaction";
import { getPhantom } from "@/lib/wallet/phantom";
import { useWallet } from "./useWallet";

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

export function BuyFlow({ slug, claim, holdings, versionId, initialWeights, callStatement, initialNotice }: { slug: string; claim: string; holdings: Holding[]; versionId: string; initialWeights?: number[]; callStatement?: string; initialNotice?: string }) {
  const w = useWallet();
  const [budget, setBudget] = useState(Number(DEFAULT_BASKET_RAW) / 1e6);
  const [weights, setWeights] = useState(initialWeights ?? holdings.map((h) => h.weightBps / 100));
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [restoring, setRestoring] = useState(false);
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

  const belowMin = budget < MIN_USD;
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
        }),
      });
      setIntent(created);
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
  }, [slug, budget, weights, holdings, versionId]);

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

        const provider = getPhantom();
        if (!provider) throw new Error("Phantom is no longer available.");
        const signed = await signWithPhantom(prepared.transactionB64!, provider);

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
  }, [intent, refresh]);

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
        <button className="by-back" onClick={() => setIntent(null)}>
          <ArrowLeft size={14} aria-hidden="true" /> Change the allocation
        </button>
        <h2 className="by-h2">Review, then buy.</h2>

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

        <p className="by-approvals">
          <strong>{intent.legs.length} purchases.</strong>{" "}
          {intent.executionMode === "live"
            ? "Your wallet will ask you to approve each one."
            : "This basket is in simulation, so no approval will be requested."}
        </p>

        {error && <p className="by-error">{error}</p>}

        <div className="by-actions">
          <button className="ln-btn ln-btn--ink" onClick={buy} disabled={busy !== null}>
            {busy ? <Loader2 size={16} className="by-spin" aria-hidden="true" /> : null}
            {intent.executionMode === "live" ? "Review and buy" : "Run the simulation"}
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ allocation */

  return (
    <div className="by-panel">
      <h1 className="by-h2">Back this thesis.</h1>
      <p className="by-claim">{claim}</p>
      {callStatement && <div className="by-call-context"><strong>The creator’s call</strong><p>{callStatement}</p><small>Your investment starts at your own entry price. The deadline does not sell your holdings.</small></div>}
      {notice && <p className="by-notice" role="status">{notice}</p>}

      <label className="by-budget">
        <span>Amount in USDC</span>
        <input
          type="number"
          inputMode="decimal"
          min={MIN_USD}
          max={1_000_000}
          step={25}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
        />
      </label>
      {belowMin && (
        <p className="by-hint by-hint--warn">
          The minimum is ${MIN_USD}. Below that, fees are a large share of what you put in.
        </p>
      )}
      {!validBudget && <p className="by-error" role="alert">Enter an amount between $75 and $1,000,000.</p>}

      <ul className="by-weights">
        {holdings.map((h, i) => {
          const legRaw = (budgetRaw * BigInt(weights[i])) / 100n;
          return (
            <li key={h.symbol}>
              <div className="by-weight-top">
                <span className="by-weight-name">
                  <strong>{h.symbol}</strong>
                  <span className="by-leg-company">{h.company} · {h.role}</span>
                </span>
                <span className="by-weight-figures">
                  <strong>{weights[i]}%</strong>
                  <span>{formatUsdc(legRaw)}</span>
                </span>
              </div>
              <input
                type="range"
                min={MIN_W}
                max={MAX_W}
                step={1}
                value={weights[i]}
                aria-label={`${h.company} weight, percent`}
                onChange={(e) => setWeights((c) => c.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              />
            </li>
          );
        })}
      </ul>

      <p className={`by-hint${remainder !== 0 ? " by-hint--warn" : ""}`} role="status">
        {remainder === 0
          ? edited
            ? "Totals 100%. Your allocation differs from the author's."
            : "Totals 100%. This is the author's allocation."
          : remainder > 0
            ? `${remainder}% still to allocate.`
            : `${-remainder}% over. Reduce one of the holdings.`}
        {edited && (
          <button className="by-reset" onClick={() => setWeights(authorWeights)}>
            Reset to the author&rsquo;s weights
          </button>
        )}
      </p>

      <p className="by-est">
        Estimated cost {formatUsdc(costRaw)} on {formatUsdc(budgetRaw)}. Jupiter charges it; Thesis adds nothing.
      </p>

      {!w.wallet ? (
        <div className="by-actions">
          <button className="ln-btn ln-btn--ink" onClick={w.connect} disabled={w.connecting || w.signingIn}>
            <Wallet size={16} aria-hidden="true" />
            {w.connecting ? "Connecting…" : w.signingIn ? "Waiting for your signature…" : "Connect wallet"}
          </button>
          {!w.hasPhantom && (
            <a className="ln-btn ln-btn--secondary" href={w.installUrl} target="_blank" rel="noreferrer noopener">
              Install Phantom
            </a>
          )}
        </div>
      ) : (
        <div className="by-actions">
          <button className="ln-btn ln-btn--ink" onClick={review} disabled={!canReview || busy !== null}>
            {busy === "quoting" ? <Loader2 size={16} className="by-spin" aria-hidden="true" /> : null}
            {restoring ? "Restoring your basket…" : "Review whole basket"}
          </button>
          <span className="by-connected">
            <Check size={13} aria-hidden="true" />
            {w.wallet.slice(0, 4)}…{w.wallet.slice(-4)}
            {w.executionMode === "simulation" && " · simulation"}
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
