/**
 * Which state changes are legal, and what evidence each one requires.
 *
 * The table is data rather than scattered `if` statements because the dangerous
 * transitions are the ones nobody thinks to write down. Two in particular:
 *
 *   submitted -> failed   is NEVER legal on a timeout alone. A network call that did not
 *                         come back tells us nothing about whether the transaction landed.
 *                         Treating silence as failure is what sells a position twice.
 *
 *   unknown -> anything    requires evidence from the chain, not from a provider reply and
 *                         never from the browser.
 *
 * PRD §10 and TH-08 / TH-09 / TH-10.
 */

export const INTENT_STATUSES = [
  "draft",
  "quoting",
  "ready",
  "executing",
  "partial",
  "complete",
  "cancelled",
  "needs_reconciliation",
] as const;

export const LEG_STATUSES = [
  "planned",
  "quoted",
  "awaiting_signature",
  "submitted",
  "confirmed",
  "failed",
  "expired",
  "cancelled",
  "unknown",
] as const;

export type IntentStatus = (typeof INTENT_STATUSES)[number];
export type LegStatus = (typeof LEG_STATUSES)[number];

/** A leg in one of these is finished. Nothing further will happen to it on its own. */
export const TERMINAL_LEG_STATUSES: readonly LegStatus[] = ["confirmed", "failed", "expired", "cancelled"];

/** A leg in one of these may still be on chain, or about to be. Do not touch the basket. */
export const IN_FLIGHT_LEG_STATUSES: readonly LegStatus[] = ["awaiting_signature", "submitted", "unknown"];

/** Statuses that occupy the "one live leg per asset" slot in the database. */
export const OCCUPYING_LEG_STATUSES: readonly LegStatus[] = [
  "planned",
  "quoted",
  "awaiting_signature",
  "submitted",
  "unknown",
  "confirmed",
];

export type Evidence =
  /** A fresh order passed the policy guard. */
  | "order_accepted"
  /** Signed bytes verified against the message we authored, written before any network call. */
  | "signed_bytes_held"
  /** getTransaction returned the transaction with meta.err === null. */
  | "chain_success"
  /** getTransaction returned it with meta.err set. */
  | "chain_error"
  /** The blockhash has left the 150-block window: this transaction can never land. */
  | "blockhash_expired"
  /** /execute threw, timed out, or a submitted leg has gone quiet. */
  | "provider_unknown"
  /** The provider explicitly rejected before broadcast AND non-landing is proven. */
  | "provider_rejected_and_not_landed"
  /** The user declined, or asked to stop, before any bytes were signed. */
  | "user_declined"
  /** A reconciliation pass could not decide. Stay put. */
  | "inconclusive";

type LegRule = { to: LegStatus; evidence: Evidence[] };

const LEG_TRANSITIONS: Record<LegStatus, LegRule[]> = {
  planned: [
    { to: "quoted", evidence: ["order_accepted"] },
    { to: "cancelled", evidence: ["user_declined"] },
  ],
  quoted: [
    { to: "quoted", evidence: ["order_accepted"] }, // re-quote in place
    { to: "awaiting_signature", evidence: ["order_accepted"] },
    { to: "cancelled", evidence: ["user_declined"] },
  ],
  awaiting_signature: [
    { to: "submitted", evidence: ["signed_bytes_held"] },
    { to: "quoted", evidence: ["order_accepted"] }, // terms changed, re-present
    { to: "cancelled", evidence: ["user_declined"] },
  ],
  submitted: [
    { to: "confirmed", evidence: ["chain_success"] },
    { to: "failed", evidence: ["chain_error", "provider_rejected_and_not_landed"] },
    { to: "expired", evidence: ["blockhash_expired"] },
    { to: "unknown", evidence: ["provider_unknown"] },
  ],
  unknown: [
    { to: "confirmed", evidence: ["chain_success"] },
    { to: "failed", evidence: ["chain_error"] },
    { to: "expired", evidence: ["blockhash_expired"] },
  ],
  // Terminal.
  confirmed: [],
  failed: [],
  expired: [],
  cancelled: [],
};

export class IllegalTransition extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
    readonly evidence: string,
    readonly kind: "leg" | "intent",
  ) {
    super(`illegal ${kind} transition ${from} -> ${to} on evidence "${evidence}"`);
    this.name = "IllegalTransition";
  }
}

export function canTransitionLeg(from: LegStatus, to: LegStatus, evidence: Evidence): boolean {
  return LEG_TRANSITIONS[from].some((rule) => rule.to === to && rule.evidence.includes(evidence));
}

/** Throws rather than returning false: an illegal transition is a bug, not a branch. */
export function assertLegTransition(from: LegStatus, to: LegStatus, evidence: Evidence): void {
  if (!canTransitionLeg(from, to, evidence)) throw new IllegalTransition(from, to, evidence, "leg");
}

export function isTerminal(status: LegStatus): boolean {
  return TERMINAL_LEG_STATUSES.includes(status);
}

export function isInFlight(status: LegStatus): boolean {
  return IN_FLIGHT_LEG_STATUSES.includes(status);
}

/**
 * A replacement leg is a new row, and it may only exist once the previous attempt has
 * finished. The database enforces this too — a partial unique index on
 * (intent_id, asset_id) over the occupying statuses — so a forgotten check here is caught
 * as a constraint violation rather than a double spend.
 */
export function canReplaceLeg(previous: LegStatus): boolean {
  return previous === "failed" || previous === "expired" || previous === "cancelled";
}

/**
 * Re-submitting the same signed bytes is not the same operation as building a replacement.
 * The same transaction has one signature, so a second submission is either a no-op or is
 * rejected by the network as a duplicate. It is only worth doing while the blockhash lives.
 */
export function canResubmitLeg(status: LegStatus, blockhashStillValid: boolean): boolean {
  return (status === "submitted" || status === "unknown") && blockhashStillValid;
}

/**
 * The intent's status is derived from its legs, never set independently. Deriving it means
 * the aggregate cannot drift from the evidence underneath it.
 */
export function deriveIntentStatus(
  legs: LegStatus[],
  context: { anySigned: boolean; cancelledByUser: boolean },
): IntentStatus {
  if (legs.length === 0) return "draft";

  if (legs.some((l) => l === "unknown")) return "needs_reconciliation";

  const confirmed = legs.filter((l) => l === "confirmed").length;
  const terminal = legs.filter(isTerminal).length;
  const inFlight = legs.filter(isInFlight).length;

  if (confirmed === legs.length) return "complete";

  if (terminal === legs.length) {
    // Everything finished and nothing filled. If the user stopped it, that is a
    // cancellation; otherwise the basket failed and is still a cancelled intent with
    // nothing spent.
    return confirmed > 0 ? "partial" : "cancelled";
  }

  if (inFlight > 0 || context.anySigned) return "executing";
  if (context.cancelledByUser) return "cancelled";

  if (legs.every((l) => l === "quoted")) return "ready";
  return "draft";
}

/**
 * Is it safe to start a new leg, sign, or cancel right now?
 *
 * One unresolved leg freezes the whole basket. That is deliberate: while a transaction
 * might be on chain, neither spending more nor declaring the basket finished is honest.
 */
export function basketIsFrozen(legs: LegStatus[]): { frozen: boolean; reason?: string } {
  if (legs.some((l) => l === "unknown")) {
    return { frozen: true, reason: "a leg is unresolved and may be on chain; reconciling first" };
  }
  if (legs.some((l) => l === "submitted")) {
    return { frozen: true, reason: "a leg is submitted and awaiting confirmation" };
  }
  return { frozen: false };
}

/**
 * PRD §9: cancelling must not claim an outcome we cannot prove. You may not cancel while
 * anything might still land.
 */
export function canCancelIntent(legs: LegStatus[]): { ok: boolean; reason?: string } {
  if (legs.some((l) => l === "unknown" || l === "submitted")) {
    return { ok: false, reason: "a leg may still be on chain; it has to resolve before the basket can close" };
  }
  return { ok: true };
}
