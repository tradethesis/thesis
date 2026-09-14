import type { ChainReader, TransactionDetail } from "./chain";
import type { Evidence, LegStatus } from "./stateMachine";

/**
 * Resolve a leg whose outcome we do not know.
 *
 * The hard case is specific: the user signed, we called /swap/v2/execute, and the call
 * timed out. The transaction may be on chain. We cannot ask Jupiter — there is no order
 * status endpoint, all four candidates 404 — and for a gasless RFQ we cannot even name the
 * transaction, because signature 0 belongs to Jupiter's fee payer and is applied inside
 * /execute.
 *
 * Three witnesses, in order of directness. The first to answer wins; if none does, the leg
 * stays unknown and a human sees it. Nothing here ever guesses.
 *
 *   W1  signature    We have a signature (we were the fee payer, or /execute returned one
 *                    before dying). Ask the chain about it directly.
 *   W2  activity     Walk the wallet's token account and match OUR OWN signature bytes,
 *                    which appear verbatim in the landed transaction. Exact identity, not
 *                    inference from amounts.
 *   W3  expiry       The blockhash has left the 150-block window, so this transaction can
 *                    never land. A proof of non-occurrence, and the only thing that makes a
 *                    replacement safe.
 */

export type LegForReconcile = {
  id: string;
  status: LegStatus;
  wallet: string;
  inputMint: string;
  outputMint: string;
  plannedInRaw: bigint;
  /** Derivable only when the taker is the fee payer. */
  derivedSignature: string | null;
  /** The user's own 64 bytes, base58. Present once they signed. */
  takerSignature: string | null;
  /** Whatever /execute told us before it died, if anything. */
  providerSignature: string | null;
  recentBlockhash: string | null;
  /** Chain head at prepare time. Nothing before this slot can be ours. */
  preflightSlot: bigint | null;
  /** The taker's associated token account for outputMint. */
  outputTokenAccount: string | null;
  lastScannedSignature: string | null;
};

export type FillEvidence = {
  signature: string;
  inRaw: bigint;
  outRaw: bigint;
  slot: number;
  blockTime: Date | null;
  feeLamports: bigint;
  confirmationStatus: "confirmed" | "finalized";
  amountSource: "chain_delta";
};

export type ReconcileOutcome =
  | { resolution: "confirmed"; nextStatus: "confirmed"; evidence: Evidence; witness: "signature" | "activity"; fill: FillEvidence }
  | { resolution: "failed"; nextStatus: "failed"; evidence: Evidence; witness: "signature" | "activity"; signature: string; error: unknown }
  | { resolution: "expired"; nextStatus: "expired"; evidence: Evidence; witness: "expiry" }
  | { resolution: "inconclusive"; nextStatus: null; evidence: "inconclusive"; reason: string };

const inconclusive = (reason: string): ReconcileOutcome => ({
  resolution: "inconclusive",
  nextStatus: null,
  evidence: "inconclusive",
  reason,
});

/**
 * How much of each mint did this wallet actually gain and lose?
 *
 * Read from the transaction's own pre/post token balances, never from the quote. Using the
 * quote's numbers biases every slip figure that is ever computed from them, which is the
 * lesson written into filled_qty_from_tx in ~/copy-desk/live.py.
 */
export function deltaFor(tx: TransactionDetail, wallet: string, mint: string): bigint | null {
  const sum = (balances: typeof tx.preTokenBalances) =>
    balances
      .filter((b) => b.mint === mint && b.owner === wallet)
      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n);

  const pre = tx.preTokenBalances.some((b) => b.mint === mint && b.owner === wallet);
  const post = tx.postTokenBalances.some((b) => b.mint === mint && b.owner === wallet);
  // A token account created by this very transaction has no pre balance. That is a zero,
  // not a missing reading — but if neither side mentions the mint at all, we know nothing.
  if (!pre && !post) return null;

  return sum(tx.postTokenBalances) - sum(tx.preTokenBalances);
}

/** Does this transaction do what our leg was supposed to do, for our wallet? */
export function matchesLeg(tx: TransactionDetail, leg: LegForReconcile): boolean {
  const outDelta = deltaFor(tx, leg.wallet, leg.outputMint);
  const inDelta = deltaFor(tx, leg.wallet, leg.inputMint);
  if (outDelta === null || inDelta === null) return false;
  if (outDelta <= 0n) return false;
  // The input must have left, and by no more than we planned to spend. More than planned
  // means this is somebody else's transaction, not a variation on ours.
  if (inDelta >= 0n) return false;
  return -inDelta <= leg.plannedInRaw;
}

function buildFill(tx: TransactionDetail, leg: LegForReconcile, signature: string): FillEvidence | null {
  const outDelta = deltaFor(tx, leg.wallet, leg.outputMint);
  const inDelta = deltaFor(tx, leg.wallet, leg.inputMint);
  if (outDelta === null || inDelta === null) return null;
  return {
    signature,
    inRaw: -inDelta,
    outRaw: outDelta,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    feeLamports: BigInt(tx.fee),
    confirmationStatus: "confirmed",
    amountSource: "chain_delta",
  };
}

/** W1 — we have a signature; ask about it directly. */
async function signatureWitness(leg: LegForReconcile, chain: ChainReader): Promise<ReconcileOutcome | null> {
  const signature = leg.derivedSignature ?? leg.providerSignature;
  if (!signature) return null;

  const statuses = await chain.getSignatureStatuses([signature]);
  if (statuses === null) return null; // lookup failed; say nothing
  const status = statuses[0];
  if (!status) return null; // genuinely not found yet — not the same as failed

  const tx = await chain.getTransaction(signature);
  if (!tx) return null;

  if (tx.err ?? status.err) {
    return {
      resolution: "failed",
      nextStatus: "failed",
      evidence: "chain_error",
      witness: "signature",
      signature,
      error: tx.err ?? status.err,
    };
  }

  const fill = buildFill(tx, leg, signature);
  if (!fill) return inconclusive("the transaction landed but its token balances do not mention our mints");

  return {
    resolution: "confirmed",
    nextStatus: "confirmed",
    evidence: "chain_success",
    witness: "signature",
    fill: { ...fill, confirmationStatus: status.confirmationStatus === "finalized" ? "finalized" : "confirmed" },
  };
}

/**
 * W2 — no signature to ask about. Walk the token account the tokens would have landed in
 * and look for our own signature bytes.
 *
 * Scanning the token account rather than the wallet is deliberate: every transfer that
 * changes the balance touches that account, and it is the same address the attribution
 * scan already walks.
 */
async function activityWitness(leg: LegForReconcile, chain: ChainReader): Promise<ReconcileOutcome | null> {
  if (!leg.outputTokenAccount) return null;

  const signatures = await chain.getSignaturesForAddress(leg.outputTokenAccount, {
    limit: 25,
    ...(leg.lastScannedSignature ? { until: leg.lastScannedSignature } : {}),
  });
  if (signatures === null) return null;

  for (const entry of signatures) {
    if (leg.preflightSlot !== null && BigInt(entry.slot) < leg.preflightSlot) continue;

    const tx = await chain.getTransaction(entry.signature);
    if (!tx) continue;

    // Exact byte identity beats inference. If our signature is in this transaction's
    // signature array, this transaction IS ours.
    const isOurs = leg.takerSignature ? tx.signatures.includes(leg.takerSignature) : matchesLeg(tx, leg);
    if (!isOurs) continue;

    if (tx.err) {
      return {
        resolution: "failed",
        nextStatus: "failed",
        evidence: "chain_error",
        witness: "activity",
        signature: entry.signature,
        error: tx.err,
      };
    }

    const fill = buildFill(tx, leg, entry.signature);
    if (!fill) continue;

    return { resolution: "confirmed", nextStatus: "confirmed", evidence: "chain_success", witness: "activity", fill };
  }

  return null;
}

/** W3 — proof that nothing can land any more. */
async function expiryWitness(leg: LegForReconcile, chain: ChainReader): Promise<ReconcileOutcome | null> {
  if (!leg.recentBlockhash) return null;
  const valid = await chain.isBlockhashValid(leg.recentBlockhash);
  if (valid === null) return null;
  if (valid) return null; // it could still land; keep waiting
  return { resolution: "expired", nextStatus: "expired", evidence: "blockhash_expired", witness: "expiry" };
}

/**
 * Run the witnesses in order. Expiry runs last and only after the other two have found
 * nothing, because declaring a transaction dead while it is still in flight is the one
 * mistake that leads to a replacement being signed on top of a live transaction.
 */
export async function reconcileLeg(leg: LegForReconcile, chain: ChainReader): Promise<ReconcileOutcome> {
  if (leg.status !== "submitted" && leg.status !== "unknown") {
    return inconclusive(`leg is ${leg.status}; nothing to reconcile`);
  }

  const bySignature = await signatureWitness(leg, chain);
  if (bySignature) return bySignature;

  const byActivity = await activityWitness(leg, chain);
  if (byActivity) return byActivity;

  const byExpiry = await expiryWitness(leg, chain);
  if (byExpiry) return byExpiry;

  return inconclusive("no witness could resolve this leg yet");
}
