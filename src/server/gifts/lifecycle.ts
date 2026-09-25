/**
 * The funded gift's state machine.
 *
 * Pure: no database, no network. Everything that decides whether a transition is legal lives here
 * so it can be tested exhaustively, and the repository only ever asks this module before it writes.
 *
 * See docs/gifting.md, "Architecture decision · 23 September 2026", for why the machine has no
 * refund states: funds go straight to a wallet only the recipient's X account can use, so nothing
 * could make a refund true, and a state that can never be reached honestly is a promise.
 *
 * The unfunded preview is outside this machine entirely.
 */

export const GIFT_STATES = [
  "draft",
  "awaiting_recipient",
  "recipient_resolved",
  "wallet_provisioned",
  "funding_pending",
  "reconciling",
  "funded",
  "claim_reserved",
  "delivering",
  "claimed",
  "claimed_partial",
  "cancelled",
  "failed",
] as const;

export type GiftState = (typeof GIFT_STATES)[number];

/**
 * Every legal edge. Anything not listed is refused.
 *
 * `reconciling` can return to `funding_pending` only through fresh evidence, never by a retry, and
 * can resolve to `funded` or `failed`. `cancelled` is reachable only before the sender has been
 * shown a destination to pay: after that, funds may already be in flight and physically in the
 * recipient's wallet whatever this table says.
 */
const EDGES: Record<GiftState, readonly GiftState[]> = {
  draft: ["recipient_resolved", "awaiting_recipient", "cancelled"],
  // Accept-then-fund: nobody could say which X account the handle is, so the recipient proves it by
  // signing in with it. That binds the account and its wallet in one step.
  awaiting_recipient: ["wallet_provisioned", "cancelled"],
  recipient_resolved: ["wallet_provisioned", "cancelled"],
  wallet_provisioned: ["funding_pending", "cancelled"],
  funding_pending: ["funded", "reconciling", "failed"],
  reconciling: ["funded", "failed", "funding_pending"],
  funded: ["claim_reserved"],
  claim_reserved: ["delivering", "funded"],
  // Back to funded only when delivery spent nothing: every leg ended and none filled, so the USDC
  // is untouched in the recipient's wallet and opening can be tried again.
  delivering: ["claimed", "claimed_partial", "funded"],
  claimed: [],
  claimed_partial: [],
  cancelled: [],
  failed: [],
};

export function canTransition(from: GiftState, to: GiftState): boolean {
  return EDGES[from].includes(to);
}

export const TERMINAL: ReadonlySet<GiftState> = new Set(
  GIFT_STATES.filter((s) => EDGES[s].length === 0),
);

/** Funds have left the sender. From here nothing the sender does can take them back. */
export function isFundsCommitted(state: GiftState): boolean {
  return [
    "funding_pending",
    "reconciling",
    "funded",
    "claim_reserved",
    "delivering",
    "claimed",
    "claimed_partial",
  ].includes(state);
}

export class TransitionRefused extends Error {
  constructor(
    readonly from: GiftState,
    readonly to: GiftState,
  ) {
    super(`A gift cannot move from ${from} to ${to}.`);
    this.name = "TransitionRefused";
  }
}

export function assertTransition(from: GiftState, to: GiftState): void {
  if (!canTransition(from, to)) throw new TransitionRefused(from, to);
}

/**
 * What a finished (or unfinished) purchase means for the gift.
 *
 * Delivery is the recipient's own purchase through the existing buy engine, whose intent status is
 * derived from reconciled legs (src/server/execution/stateMachine.ts) and is therefore evidence,
 * not a claim. `needs_reconciliation` keeps the gift where it is: a leg whose outcome is unknown is
 * never retried blindly, here or there.
 */
export type IntentStatusForDelivery =
  | "draft" | "quoting" | "ready" | "executing" | "partial" | "complete" | "cancelled" | "needs_reconciliation";

export function deliveryOutcome(status: IntentStatusForDelivery): "claimed" | "claimed_partial" | "released" | "pending" {
  switch (status) {
    case "complete":
      return "claimed";
    case "partial":
      return "claimed_partial";
    case "cancelled":
      return "released";
    default:
      return "pending";
  }
}
