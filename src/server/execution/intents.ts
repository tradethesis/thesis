import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";
import { db } from "../db/client";
import { asset, fill, investmentIntent, position, positionHolding, swapLeg, thesis, thesisConstituent, thesisVersion } from "../db/schema";
import { assetByMint, QUOTE_ASSET, USDC_MINT } from "../assets/allowlist";
import { allocate, validateAllocation, type WeightedLeg } from "@/lib/money/allocate";
import { MIN_BASKET_RAW, estimateBasketCost } from "@/lib/money/cost";
import { evaluateOrder, type PolicyResult } from "@/lib/policy/orderPolicy";
import { createOrder, executeOrder, JupiterError, type JupiterOrder } from "../jupiter/client";
import { verifyUserSignature } from "./verifySignature";
import { reconcileLeg, type LegForReconcile } from "./reconcile";
import { chain } from "./chainReader";
import {
  assertLegTransition,
  basketIsFrozen,
  canCancelIntent,
  deriveIntentStatus,
  type LegStatus,
} from "./stateMachine";
import { executionModeForWallet } from "../env";

/**
 * The buy flow.
 *
 * Every rule that matters already lives somewhere else — allocate() splits the budget,
 * orderPolicy decides whether an order may be signed, stateMachine says which transitions
 * are legal, reconcile resolves a leg we lost track of. This module is the chassis that
 * calls them in the right order and writes the results down.
 *
 * Two invariants it exists to hold:
 *
 *   1. A leg moves to `submitted` BEFORE anything can reach the chain. The row is
 *      committed first, then /execute is called. If the process dies in between, the
 *      reconciler has a row to work from.
 *   2. Nothing is confirmed from a provider's say-so. `executeOrder` returning
 *      {status:"Success"} yields a signature to look up, not a fill to write.
 */

export class IntentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "IntentError";
  }
}

function fail(code: string, message: string): never {
  throw new IntentError(code, message);
}

/* ------------------------------------------------------------------ create */

export type CreateIntentInput = {
  wallet: string;
  slug: string;
  budgetRaw: bigint;
  /** Symbol -> weight in basis points, as the user confirmed them. */
  weights: { symbol: string; weightBps: number }[];
  idempotencyKey: string;
};

export async function createIntent(input: CreateIntentInput) {
  if (input.budgetRaw < MIN_BASKET_RAW) {
    fail(
      "below_minimum",
      `The minimum basket is $${Number(MIN_BASKET_RAW) / 1e6}. Below that, fees are a large share of what you put in.`,
    );
  }

  // Reuse rather than duplicate: the same key always returns the same intent.
  const [existing] = await db
    .select()
    .from(investmentIntent)
    .where(eq(investmentIntent.idempotencyKey, input.idempotencyKey));
  if (existing) {
    if (existing.wallet !== input.wallet) fail("not_yours", "That intent belongs to another wallet.");
    return getIntent(existing.id, input.wallet);
  }

  const [version] = await db
    .select({ id: thesisVersion.id, number: thesisVersion.versionNumber, claim: thesisVersion.claim })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(eq(thesis.slug, input.slug));
  if (!version) fail("unknown_thesis", "That thesis is not published.");

  const constituents = await db
    .select({
      symbol: asset.symbol,
      mint: asset.mint,
      assetId: asset.id,
      enabled: asset.enabled,
      network: asset.network,
      position: thesisConstituent.position,
      authorWeightBps: thesisConstituent.weightBps,
    })
    .from(thesisConstituent)
    .innerJoin(asset, eq(thesisConstituent.assetId, asset.id))
    .where(eq(thesisConstituent.versionId, version.id))
    .orderBy(asc(thesisConstituent.position));

  const executionMode = executionModeForWallet(input.wallet);

  // TH-05 and TH-14 at the order boundary: resolve by mint through the allowlist, never by
  // symbol, and refuse anything disabled or not on the network we are executing against.
  for (const c of constituents) {
    const allow = assetByMint(c.mint);
    if (!allow) fail("unknown_asset", `${c.symbol} is not on the verified allowlist.`);
    if (!allow.enabled || !c.enabled) fail("asset_disabled", `${c.symbol} is not currently tradable.`);
    if (c.network !== "mainnet") fail("wrong_network", `${c.symbol} is not a mainnet asset.`);
  }

  // Weights: the user's if supplied and valid, otherwise the author's.
  const bySymbol = new Map(input.weights.map((w) => [w.symbol, w.weightBps]));
  const legs: WeightedLeg[] = constituents.map((c) => ({
    assetId: c.symbol,
    positionIndex: c.position,
    bps: bySymbol.get(c.symbol) ?? c.authorWeightBps,
  }));
  validateAllocation(legs);

  const isCustom = constituents.some((c) => (bySymbol.get(c.symbol) ?? c.authorWeightBps) !== c.authorWeightBps);
  const allocated = allocate(input.budgetRaw, legs);

  const intentId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(investmentIntent)
      .values({
        idempotencyKey: input.idempotencyKey,
        wallet: input.wallet,
        thesisVersionId: version.id,
        direction: "buy",
        budgetRaw: input.budgetRaw.toString(),
        inputMint: USDC_MINT,
        weightsBps: legs.map((l) => ({ symbol: l.assetId, positionIndex: l.positionIndex, bps: l.bps })),
        isCustomAllocation: isCustom,
        status: "draft",
        executionMode,
      })
      .returning({ id: investmentIntent.id });

    for (const c of constituents) {
      const share = allocated.find((a) => a.assetId === c.symbol)!;
      await tx.insert(swapLeg).values({
        intentId: created.id,
        assetId: c.assetId,
        legIndex: c.position,
        inputMint: USDC_MINT,
        outputMint: c.mint,
        plannedInRaw: share.amountRaw.toString(),
        status: "planned",
      });
    }
    return created.id;
  });

  return getIntent(intentId, input.wallet);
}

/* ------------------------------------------------------------------- quote */

/** Preflight every leg. If one has no route, the basket does not start (PRD §10 step 4). */
export async function quoteIntent(intentId: string, wallet: string) {
  const intent = await loadIntent(intentId, wallet);
  const legs = await loadLegs(intentId);

  await db.update(investmentIntent).set({ status: "quoting", updatedAt: new Date() }).where(eq(investmentIntent.id, intentId));

  const problems: string[] = [];
  for (const leg of legs) {
    if (leg.status !== "planned" && leg.status !== "quoted") continue;
    try {
      const order = await createOrder({
        inputMint: leg.inputMint,
        outputMint: leg.outputMint,
        amountRaw: BigInt(leg.plannedInRaw),
      });
      const verdict = evaluateOrder(order, {
        plannedInRaw: BigInt(leg.plannedInRaw),
        expectedInputMint: leg.inputMint,
        expectedOutputMint: leg.outputMint,
        expectedTaker: intent.wallet,
        requireExecutable: false,
        nowMs: Date.now(),
      });
      if (verdict.outcome === "reject") {
        problems.push(`${leg.symbol}: ${verdict.message}`);
        continue;
      }
      const out = verdict.outcome === "ok" ? verdict.outRaw : verdict.outRaw;
      const minOut = verdict.outcome === "ok" ? verdict.minOutRaw : verdict.minOutRaw;
      await writeQuote(leg.id, order, out, minOut, leg.status === "planned");
    } catch (error) {
      problems.push(`${leg.symbol}: ${(error as Error).message}`);
    }
  }

  if (problems.length) {
    await db.update(investmentIntent).set({ status: "draft", updatedAt: new Date() }).where(eq(investmentIntent.id, intentId));
    fail("leg_unavailable", `This basket cannot be priced right now. ${problems.join("; ")}`);
  }

  await db
    .update(investmentIntent)
    .set({ status: "ready", quotedAt: new Date(), updatedAt: new Date() })
    .where(eq(investmentIntent.id, intentId));

  return getIntent(intentId, wallet);
}

async function writeQuote(
  legId: string,
  order: JupiterOrder,
  outRaw: bigint,
  minOutRaw: bigint,
  setReviewedBaseline: boolean,
) {
  await db
    .update(swapLeg)
    .set({
      status: "quoted",
      quoteOutRaw: outRaw.toString(),
      quoteMinOutRaw: minOutRaw.toString(),
      quoteRouter: order.router,
      quoteSwapType: order.swapType,
      quoteMode: order.mode,
      quoteSlippageBps: order.slippageBps,
      quotePriceImpactPct: Number(order.priceImpactPct),
      quoteFeeBps: order.feeBps,
      quotePlatformFee: order.platformFee ?? null,
      quoteGasless: order.gasless,
      quoteRentLamports: BigInt(order.rentFeeLamports ?? 0),
      quoteSignatureFeeLamports: BigInt(order.signatureFeeLamports ?? 0),
      quotePriorityFeeLamports: BigInt(order.prioritizationFeeLamports ?? 0),
      quoteRentPayer: order.rentFeePayer ?? null,
      quoteSignaturePayer: order.signatureFeePayer ?? null,
      quoteFetchedAt: new Date(),
      quoteExpiresAt: order.expireAt ? new Date(Number(order.expireAt) * 1000) : null,
      ...(setReviewedBaseline
        ? { reviewedOutRaw: outRaw.toString(), reviewedMinOutRaw: minOutRaw.toString(), reviewedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(swapLeg.id, legId));
}

export { loadIntent, loadLegs };

/* ------------------------------------------------------------------ shared */

async function loadIntent(intentId: string, wallet: string) {
  const [row] = await db.select().from(investmentIntent).where(eq(investmentIntent.id, intentId));
  if (!row) fail("not_found", "No such basket.");
  // TH-06: only the wallet that owns it may act on it.
  if (row.wallet !== wallet) fail("not_yours", "That basket belongs to another wallet.");
  return row;
}

async function loadLegs(intentId: string) {
  return db
    .select({
      id: swapLeg.id,
      legIndex: swapLeg.legIndex,
      status: swapLeg.status,
      inputMint: swapLeg.inputMint,
      outputMint: swapLeg.outputMint,
      plannedInRaw: swapLeg.plannedInRaw,
      quoteOutRaw: swapLeg.quoteOutRaw,
      quoteMinOutRaw: swapLeg.quoteMinOutRaw,
      quoteRouter: swapLeg.quoteRouter,
      quoteGasless: swapLeg.quoteGasless,
      quoteFeeBps: swapLeg.quoteFeeBps,
      quoteExpiresAt: swapLeg.quoteExpiresAt,
      reviewedOutRaw: swapLeg.reviewedOutRaw,
      reviewedMinOutRaw: swapLeg.reviewedMinOutRaw,
      transactionB64: swapLeg.transactionB64,
      signedTransactionB64: swapLeg.signedTransactionB64,
      messageHash: swapLeg.messageHash,
      recentBlockhash: swapLeg.recentBlockhash,
      derivedSignature: swapLeg.derivedSignature,
      takerSignature: swapLeg.takerSignature,
      providerSignature: swapLeg.providerSignature,
      preflightSlot: swapLeg.preflightSlot,
      quoteRequestId: swapLeg.quoteRequestId,
      lastScannedSignature: swapLeg.lastScannedSignature,
      errorKind: swapLeg.errorKind,
      errorDetail: swapLeg.errorDetail,
      symbol: asset.symbol,
      company: asset.company,
      decimals: asset.decimals,
      assetId: asset.id,
    })
    .from(swapLeg)
    .innerJoin(asset, eq(swapLeg.assetId, asset.id))
    .where(eq(swapLeg.intentId, intentId))
    .orderBy(asc(swapLeg.legIndex));
}

export type LoadedLeg = Awaited<ReturnType<typeof loadLegs>>[number];

/* ------------------------------------------------------------------- read */

export async function getIntent(intentId: string, wallet: string, options: { reconcile?: boolean } = {}) {
  const intent = await loadIntent(intentId, wallet);

  if (options.reconcile !== false) {
    await reconcileIntent(intentId);
  }

  const legs = await loadLegs(intentId);
  const statuses = legs.map((l) => l.status as LegStatus);
  const derived = deriveIntentStatus(statuses, {
    anySigned: legs.some((l) => l.signedTransactionB64 !== null),
    cancelledByUser: intent.status === "cancelled",
  });

  if (derived !== intent.status) {
    await db
      .update(investmentIntent)
      .set({
        status: derived,
        updatedAt: new Date(),
        ...(derived === "complete" || derived === "partial" ? { settledAt: new Date() } : {}),
      })
      .where(eq(investmentIntent.id, intentId));
  }

  const fills = await db.select().from(fill).where(eq(fill.intentId, intentId));
  const spentRaw = fills.reduce((acc, f) => acc + BigInt(f.inRaw), 0n);
  const budgetRaw = BigInt(intent.budgetRaw ?? "0");

  return {
    id: intent.id,
    wallet: intent.wallet,
    status: derived,
    executionMode: intent.executionMode,
    budgetRaw,
    spentRaw,
    /** PRD Screen E: unspent USDC stays in the wallet. Never described as reserved. */
    unspentRaw: budgetRaw - spentRaw,
    isCustomAllocation: intent.isCustomAllocation,
    frozen: basketIsFrozen(statuses),
    canCancel: canCancelIntent(statuses),
    legs: legs.map((l) => ({
      ...l,
      fill: fills.find((f) => f.legId === l.id) ?? null,
    })),
  };
}

export type IntentView = Awaited<ReturnType<typeof getIntent>>;

/* ------------------------------------------------------------- reconcile */

/**
 * Resolve anything outstanding. Called from the intent read the progress screen polls,
 * from the execute route's finally, and from the cron route — never as a daemon.
 *
 * The advisory lock means two callers never work the same intent at once; the unique
 * constraint on fill.signature means it would be harmless if they did.
 */
export async function reconcileIntent(intentId: string): Promise<number> {
  const legs = await loadLegs(intentId);
  const outstanding = legs.filter((l) => l.status === "submitted" || l.status === "unknown");
  if (!outstanding.length) return 0;

  const wallet = await loadIntentWallet(intentId);
  if (!wallet) return 0;

  let resolved = 0;
  for (const leg of outstanding) {
    const got = await db.transaction(async (tx) => {
      const [{ locked }] = await tx.execute<{ locked: boolean }>(
        raw`select pg_try_advisory_xact_lock(hashtextextended(${intentId}::text, 0)) as locked`,
      );
      if (!locked) return false;

      const forReconcile: LegForReconcile = {
        id: leg.id,
        status: leg.status as LegStatus,
        wallet,
        inputMint: leg.inputMint,
        outputMint: leg.outputMint,
        plannedInRaw: BigInt(leg.plannedInRaw),
        derivedSignature: leg.derivedSignature,
        takerSignature: leg.takerSignature,
        providerSignature: leg.providerSignature,
        recentBlockhash: leg.recentBlockhash,
        preflightSlot: leg.preflightSlot,
        outputTokenAccount: null,
        lastScannedSignature: leg.lastScannedSignature,
      };

      const outcome = await reconcileLeg(forReconcile, chain);
      if (outcome.resolution === "inconclusive") {
        await tx
          .update(swapLeg)
          .set({ reconcileAttempts: (leg as unknown as { reconcileAttempts: number }).reconcileAttempts + 1 })
          .where(eq(swapLeg.id, leg.id));
        return false;
      }

      assertLegTransition(leg.status as LegStatus, outcome.nextStatus, outcome.evidence);

      if (outcome.resolution === "confirmed") {
        await tx
          .insert(fill)
          .values({
            legId: leg.id,
            intentId,
            signature: outcome.fill.signature,
            wallet,
            inputMint: leg.inputMint,
            outputMint: leg.outputMint,
            inRaw: outcome.fill.inRaw.toString(),
            outRaw: outcome.fill.outRaw.toString(),
            amountSource: outcome.fill.amountSource,
            feeLamports: outcome.fill.feeLamports,
            slot: BigInt(outcome.fill.slot),
            blockTime: outcome.fill.blockTime,
            confirmationStatus: outcome.fill.confirmationStatus,
          })
          .onConflictDoNothing({ target: fill.signature });
      }

      await tx
        .update(swapLeg)
        .set({
          status: outcome.nextStatus,
          resolvedAt: new Date(),
          updatedAt: new Date(),
          ...(outcome.resolution === "failed"
            ? { errorKind: "chain_error", errorDetail: JSON.stringify(outcome.error).slice(0, 500) }
            : {}),
        })
        .where(eq(swapLeg.id, leg.id));
      return true;
    });
    if (got) resolved += 1;
  }
  return resolved;
}

async function loadIntentWallet(intentId: string): Promise<string | null> {
  const [row] = await db.select({ wallet: investmentIntent.wallet }).from(investmentIntent).where(eq(investmentIntent.id, intentId));
  return row?.wallet ?? null;
}

/* ----------------------------------------------------------------- prepare */

/**
 * Fetch a fresh order for this leg, check it, write everything down, and hand back the
 * bytes to sign.
 *
 * Everything is committed before the base64 leaves the server. The message hash in
 * particular: the execute route compares the wallet's returned transaction against the hash
 * WE stored, not against anything the client sends back. That is the difference between
 * this and the signing-check harness.
 */
export async function prepareLeg(intentId: string, legId: string, wallet: string) {
  const intent = await loadIntent(intentId, wallet);
  const legs = await loadLegs(intentId);
  const statuses = legs.map((l) => l.status as LegStatus);

  const frozen = basketIsFrozen(statuses);
  if (frozen.frozen) fail("basket_frozen", frozen.reason!);

  const leg = legs.find((l) => l.id === legId);
  if (!leg) fail("not_found", "No such leg.");
  if (leg.status !== "quoted") fail("wrong_state", `This leg is ${leg.status}, not ready to sign.`);

  const order = await createOrder({
    inputMint: leg.inputMint,
    outputMint: leg.outputMint,
    amountRaw: BigInt(leg.plannedInRaw),
    taker: wallet,
  });

  const verdict: PolicyResult = evaluateOrder(order, {
    plannedInRaw: BigInt(leg.plannedInRaw),
    expectedInputMint: leg.inputMint,
    expectedOutputMint: leg.outputMint,
    expectedTaker: wallet,
    reviewedOutRaw: leg.reviewedOutRaw ? BigInt(leg.reviewedOutRaw) : undefined,
    reviewedMinOutRaw: leg.reviewedMinOutRaw ? BigInt(leg.reviewedMinOutRaw) : undefined,
    requireExecutable: true,
    nowMs: Date.now(),
  });

  if (verdict.outcome === "reject") {
    await db.update(swapLeg).set({ errorKind: verdict.code, errorDetail: verdict.message }).where(eq(swapLeg.id, legId));
    fail(verdict.code, verdict.message);
  }

  if (verdict.outcome === "terms_changed") {
    // Re-present rather than sign. The user approves the new number or goes back.
    await writeQuote(legId, order, verdict.outRaw, verdict.minOutRaw, false);
    return {
      outcome: "terms_changed" as const,
      driftBps: verdict.driftBps,
      message: verdict.message,
      reviewedMinOutRaw: verdict.reviewedMinOutRaw,
      minOutRaw: verdict.minOutRaw,
      symbol: leg.symbol,
    };
  }

  const { splitTransaction, base64ToBytes } = await import("@/lib/wallet/transaction");
  const { hashMessage } = await import("./verifySignature");
  const parts = splitTransaction(base64ToBytes(order.transaction!));
  const messageHash = hashMessage(parts.message);
  const slot = await chain.getSlot();

  await db.transaction(async (tx) => {
    assertLegTransition("quoted", "awaiting_signature", "order_accepted");
    await tx
      .update(swapLeg)
      .set({
        status: "awaiting_signature",
        quoteRequestId: order.requestId,
        transactionB64: order.transaction,
        messageHash,
        feePayer: order.signatureFeePayer ?? null,
        preflightSlot: slot !== null ? BigInt(slot) : null,
        quoteOutRaw: verdict.outRaw.toString(),
        quoteMinOutRaw: verdict.minOutRaw.toString(),
        quoteRouter: order.router,
        quoteSwapType: order.swapType,
        quoteGasless: order.gasless,
        quoteFeeBps: order.feeBps,
        quoteExpiresAt: verdict.expiresAtMs ? new Date(verdict.expiresAtMs) : null,
        quoteFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(swapLeg.id, legId), eq(swapLeg.status, "quoted")));

    await tx
      .update(investmentIntent)
      .set({ status: "executing", updatedAt: new Date(), ...(intent.firstSignedAt ? {} : { firstSignedAt: new Date() }) })
      .where(eq(investmentIntent.id, intentId));
  });

  return {
    outcome: "ready" as const,
    symbol: leg.symbol,
    company: leg.company,
    transactionB64: order.transaction!,
    minOutRaw: verdict.minOutRaw,
    outRaw: verdict.outRaw,
    router: verdict.family,
    gasless: verdict.gasless,
    feeBps: verdict.feeBps,
    expiresAtMs: verdict.expiresAtMs,
    executionMode: intent.executionMode,
  };
}

/* ----------------------------------------------------------------- execute */

/**
 * Take the signed bytes, commit `submitted`, then broadcast through Jupiter.
 *
 * The ordering is the whole point. By the time /execute is called, a row exists saying this
 * leg was submitted, so a process that dies mid-call leaves evidence rather than a silent
 * hole. And a call that throws does NOT mean failure — it means we do not know, which is
 * what `unknown` is for.
 */
export async function executeLeg(intentId: string, legId: string, wallet: string, signedB64: string) {
  const intent = await loadIntent(intentId, wallet);
  if (intent.executionMode !== "live") {
    fail("not_live", "This basket is in simulation. No signature is submitted.");
  }

  const legs = await loadLegs(intentId);
  const leg = legs.find((l) => l.id === legId);
  if (!leg) fail("not_found", "No such leg.");
  if (leg.status !== "awaiting_signature") fail("wrong_state", `This leg is ${leg.status}.`);
  if (!leg.transactionB64 || !leg.messageHash || !leg.quoteRequestId) fail("not_prepared", "This leg was never prepared.");

  // The wallet must have signed exactly what we authored. Compared against the hash the
  // server stored at prepare time, never against anything the caller supplies.
  const verdict = verifyUserSignature({ unsignedB64: leg.transactionB64, signedB64, wallet });
  if (!verdict.ok) fail(verdict.code, verdict.message);
  if (verdict.messageHash !== leg.messageHash) {
    fail("message_altered", "The signed transaction does not carry the message this server issued.");
  }

  await db.transaction(async (tx) => {
    assertLegTransition("awaiting_signature", "submitted", "signed_bytes_held");
    await tx
      .update(swapLeg)
      .set({
        status: "submitted",
        signedTransactionB64: signedB64,
        signatureDerivable: verdict.signatureDerivable,
        derivedSignature: verdict.derivedSignature,
        takerSignature: verdict.takerSignature,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(swapLeg.id, legId), eq(swapLeg.status, "awaiting_signature")));
  });

  let providerNote = "";
  try {
    const result = await executeOrder({ signedTransaction: signedB64, requestId: leg.quoteRequestId });
    await db
      .update(swapLeg)
      .set({
        providerSignature: result.signature ?? null,
        providerStatus: result.status,
        providerCode: result.code !== undefined ? String(result.code) : null,
        updatedAt: new Date(),
      })
      .where(eq(swapLeg.id, legId));
    providerNote = result.status;
  } catch (error) {
    // A thrown call tells us nothing about the chain. Not failed — unknown.
    const transient = error instanceof JupiterError ? error.transient : true;
    await db
      .update(swapLeg)
      .set({
        status: "unknown",
        errorKind: transient ? "provider_unknown" : "provider_error",
        errorDetail: (error as Error).message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(and(eq(swapLeg.id, legId), eq(swapLeg.status, "submitted")));
    await db
      .update(investmentIntent)
      .set({ status: "needs_reconciliation", updatedAt: new Date() })
      .where(eq(investmentIntent.id, intentId));
    providerNote = "unknown";
  } finally {
    await reconcileIntent(intentId);
  }

  return { providerNote, intent: await getIntent(intentId, wallet) };
}

/* ---------------------------------------------------------------- simulate */

/**
 * Walk a leg through the same states without a wallet or a broadcast.
 *
 * PRD §13 requires an explicitly labelled simulation for visitors who cannot execute, and
 * TH-14 requires it to be impossible to confuse with the real thing. The fill it writes
 * carries `amountSource: "simulated"` and a signature prefixed `sim:`, which is not a valid
 * base58 signature and so can never collide with a real one.
 */
export async function simulateLeg(intentId: string, legId: string, wallet: string) {
  const intent = await loadIntent(intentId, wallet);
  if (intent.executionMode === "live") fail("is_live", "This basket executes for real; simulation is not available.");

  const legs = await loadLegs(intentId);
  const leg = legs.find((l) => l.id === legId);
  if (!leg) fail("not_found", "No such leg.");
  if (leg.status !== "quoted" && leg.status !== "awaiting_signature") {
    fail("wrong_state", `This leg is ${leg.status}.`);
  }
  if (!leg.quoteOutRaw) fail("not_quoted", "This leg has no quote to simulate against.");

  await db.transaction(async (tx) => {
    await tx.insert(fill).values({
      legId: leg.id,
      intentId,
      signature: `sim:${leg.id}`,
      wallet,
      inputMint: leg.inputMint,
      outputMint: leg.outputMint,
      inRaw: leg.plannedInRaw,
      outRaw: leg.quoteOutRaw!,
      amountSource: "simulated",
      slot: 0n,
      confirmationStatus: "confirmed",
    });
    await tx.update(swapLeg).set({ status: "confirmed", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(swapLeg.id, leg.id));
  });

  return getIntent(intentId, wallet);
}

/* ------------------------------------------------------------------ cancel */

export async function cancelIntent(intentId: string, wallet: string) {
  await loadIntent(intentId, wallet);
  await reconcileIntent(intentId);
  const legs = await loadLegs(intentId);
  const statuses = legs.map((l) => l.status as LegStatus);

  const allowed = canCancelIntent(statuses);
  if (!allowed.ok) fail("cannot_cancel", allowed.reason!);

  const stoppable = legs.filter((l) => l.status === "planned" || l.status === "quoted" || l.status === "awaiting_signature");
  if (stoppable.length) {
    await db
      .update(swapLeg)
      .set({ status: "cancelled", resolvedAt: new Date(), updatedAt: new Date() })
      .where(inArray(swapLeg.id, stoppable.map((l) => l.id)));
  }
  return getIntent(intentId, wallet);
}

export { estimateBasketCost, QUOTE_ASSET };
