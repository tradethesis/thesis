import { describe, expect, it } from "vitest";

import { canTransition, deliveryOutcome, GIFT_STATES, isFundsCommitted, TERMINAL, TransitionRefused, assertTransition } from "./lifecycle";

describe("gift lifecycle", () => {
  it("walks the happy path one legal edge at a time", () => {
    const path = ["draft", "recipient_resolved", "wallet_provisioned", "funding_pending", "funded", "claim_reserved", "delivering", "claimed"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i]), `${path[i - 1]} → ${path[i]}`).toBe(true);
  });

  it("refuses to skip evidence: nothing is funded without a pending transfer", () => {
    expect(canTransition("wallet_provisioned", "funded")).toBe(false);
    expect(canTransition("draft", "funded")).toBe(false);
    expect(canTransition("funded", "claimed")).toBe(false);
    expect(() => assertTransition("draft", "claimed")).toThrow(TransitionRefused);
  });

  /* No refund states exist, because funds go straight to the recipient's wallet and nothing could
     make a refund true. Cancelling is only possible before the sender is asked to pay. */
  it("allows cancelling only before payment has been requested", () => {
    for (const s of ["draft", "recipient_resolved", "wallet_provisioned"] as const) expect(canTransition(s, "cancelled")).toBe(true);
    for (const s of ["funding_pending", "reconciling", "funded", "claim_reserved", "delivering"] as const) {
      expect(canTransition(s, "cancelled"), s).toBe(false);
    }
    expect(GIFT_STATES).not.toContain("refunding");
    expect(GIFT_STATES).not.toContain("refunded");
  });

  it("treats an uncertain transfer as its own state, never as failed-so-send-again", () => {
    expect(canTransition("funding_pending", "reconciling")).toBe(true);
    expect(canTransition("reconciling", "funded")).toBe(true);
    expect(canTransition("reconciling", "failed")).toBe(true);
    expect(isFundsCommitted("reconciling")).toBe(true);
  });

  it("releases a reservation, and a delivery that spent nothing, back to funded", () => {
    expect(canTransition("claim_reserved", "funded")).toBe(true);
    expect(canTransition("delivering", "funded")).toBe(true);
  });

  it("has no way out of a terminal state", () => {
    for (const s of TERMINAL) for (const t of GIFT_STATES) expect(canTransition(s, t), `${s} → ${t}`).toBe(false);
    expect([...TERMINAL].sort()).toEqual(["cancelled", "claimed", "claimed_partial", "failed"]);
  });

  it("maps the buy engine's derived intent status to a delivery outcome", () => {
    expect(deliveryOutcome("complete")).toBe("claimed");
    expect(deliveryOutcome("partial")).toBe("claimed_partial");
    expect(deliveryOutcome("cancelled")).toBe("released");
    // An unknown leg is never retried blindly: the gift waits.
    expect(deliveryOutcome("needs_reconciliation")).toBe("pending");
    expect(deliveryOutcome("executing")).toBe("pending");
  });
});
