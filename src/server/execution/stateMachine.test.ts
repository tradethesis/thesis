import { describe, expect, it } from "vitest";
import {
  IllegalTransition,
  LEG_STATUSES,
  assertLegTransition,
  basketIsFrozen,
  canCancelIntent,
  canReplaceLeg,
  canResubmitLeg,
  canTransitionLeg,
  deriveIntentStatus,
  isTerminal,
  type Evidence,
  type LegStatus,
} from "./stateMachine";

const ALL_EVIDENCE: Evidence[] = [
  "order_accepted",
  "signed_bytes_held",
  "chain_success",
  "chain_error",
  "blockhash_expired",
  "provider_unknown",
  "provider_rejected_and_not_landed",
  "user_declined",
  "inconclusive",
];

describe("the transitions that lose money", () => {
  it("never lets a timeout alone mark a leg failed", () => {
    // The whole point. /execute threw; the transaction may well be on chain.
    expect(canTransitionLeg("submitted", "failed", "provider_unknown")).toBe(false);
    expect(canTransitionLeg("unknown", "failed", "provider_unknown")).toBe(false);
    expect(canTransitionLeg("submitted", "unknown", "provider_unknown")).toBe(true);
  });

  it("only confirms a leg from a chain read", () => {
    for (const evidence of ALL_EVIDENCE) {
      const legal = canTransitionLeg("submitted", "confirmed", evidence);
      expect(legal).toBe(evidence === "chain_success");
    }
  });

  it("only expires a leg on proof that it can never land", () => {
    for (const evidence of ALL_EVIDENCE) {
      expect(canTransitionLeg("unknown", "expired", evidence)).toBe(evidence === "blockhash_expired");
    }
  });

  it("leaves an unresolved leg alone when reconciliation cannot decide", () => {
    for (const to of LEG_STATUSES) {
      expect(canTransitionLeg("unknown", to, "inconclusive")).toBe(false);
    }
  });

  it("treats terminal as terminal", () => {
    for (const from of LEG_STATUSES.filter(isTerminal)) {
      for (const to of LEG_STATUSES) {
        for (const evidence of ALL_EVIDENCE) {
          expect(canTransitionLeg(from, to, evidence)).toBe(false);
        }
      }
    }
  });

  it("writes submitted only against signed bytes we hold", () => {
    for (const evidence of ALL_EVIDENCE) {
      expect(canTransitionLeg("awaiting_signature", "submitted", evidence)).toBe(evidence === "signed_bytes_held");
    }
    // and never straight from quoted, skipping the signature
    expect(canTransitionLeg("quoted", "submitted", "signed_bytes_held")).toBe(false);
  });

  it("throws on an illegal transition rather than returning a flag", () => {
    expect(() => assertLegTransition("submitted", "failed", "provider_unknown")).toThrow(IllegalTransition);
    expect(() => assertLegTransition("confirmed", "cancelled", "user_declined")).toThrow(/illegal leg transition/);
    expect(() => assertLegTransition("submitted", "confirmed", "chain_success")).not.toThrow();
  });
});

describe("replacement and resubmission are different operations", () => {
  it("allows a replacement only after the previous attempt finished and did not fill", () => {
    expect(canReplaceLeg("failed")).toBe(true);
    expect(canReplaceLeg("expired")).toBe(true);
    expect(canReplaceLeg("cancelled")).toBe(true);
    // the two that matter
    expect(canReplaceLeg("confirmed")).toBe(false);
    expect(canReplaceLeg("unknown")).toBe(false);
    expect(canReplaceLeg("submitted")).toBe(false);
  });

  it("allows resubmitting the same bytes only while the blockhash lives", () => {
    expect(canResubmitLeg("submitted", true)).toBe(true);
    expect(canResubmitLeg("unknown", true)).toBe(true);
    expect(canResubmitLeg("submitted", false)).toBe(false);
    expect(canResubmitLeg("confirmed", true)).toBe(false);
    expect(canResubmitLeg("quoted", true)).toBe(false);
  });
});

describe("one unresolved leg freezes the basket", () => {
  it("freezes on unknown and on submitted", () => {
    expect(basketIsFrozen(["confirmed", "unknown", "planned"]).frozen).toBe(true);
    expect(basketIsFrozen(["confirmed", "submitted", "planned"]).frozen).toBe(true);
    expect(basketIsFrozen(["confirmed", "quoted", "planned"]).frozen).toBe(false);
  });

  it("refuses to cancel while anything might still land", () => {
    expect(canCancelIntent(["confirmed", "unknown", "planned"]).ok).toBe(false);
    expect(canCancelIntent(["confirmed", "submitted", "planned"]).ok).toBe(false);
    expect(canCancelIntent(["confirmed", "failed", "planned"]).ok).toBe(true);
  });
});

describe("the intent status is derived, never asserted", () => {
  const ctx = { anySigned: false, cancelledByUser: false };

  it("is complete only when every leg confirmed", () => {
    expect(deriveIntentStatus(["confirmed", "confirmed", "confirmed"], ctx)).toBe("complete");
    expect(deriveIntentStatus(["confirmed", "confirmed", "failed"], ctx)).toBe("partial");
  });

  it("is partial when some filled and the rest finished without filling", () => {
    expect(deriveIntentStatus(["confirmed", "failed", "cancelled"], ctx)).toBe("partial");
    expect(deriveIntentStatus(["confirmed", "expired", "expired"], ctx)).toBe("partial");
  });

  it("is cancelled when nothing filled and nothing is outstanding", () => {
    expect(deriveIntentStatus(["cancelled", "cancelled", "cancelled"], ctx)).toBe("cancelled");
    expect(deriveIntentStatus(["failed", "failed", "failed"], ctx)).toBe("cancelled");
  });

  it("is needs_reconciliation whenever any leg is unknown, whatever else is true", () => {
    expect(deriveIntentStatus(["confirmed", "confirmed", "unknown"], ctx)).toBe("needs_reconciliation");
    expect(deriveIntentStatus(["unknown", "unknown", "unknown"], ctx)).toBe("needs_reconciliation");
    // even when two legs already filled, the basket is not "partial" yet
    expect(deriveIntentStatus(["confirmed", "failed", "unknown"], ctx)).toBe("needs_reconciliation");
  });

  it("is ready only when every leg holds an accepted quote", () => {
    expect(deriveIntentStatus(["quoted", "quoted", "quoted"], ctx)).toBe("ready");
    expect(deriveIntentStatus(["quoted", "quoted", "planned"], ctx)).toBe("draft");
  });

  it("is executing while anything is in flight", () => {
    expect(deriveIntentStatus(["confirmed", "submitted", "planned"], ctx)).toBe("executing");
    expect(deriveIntentStatus(["quoted", "awaiting_signature", "planned"], ctx)).toBe("executing");
  });
});

describe("exhaustive sweep", () => {
  it("has no transition that both fills and is not chain-backed", () => {
    const fills: { from: LegStatus; evidence: Evidence }[] = [];
    for (const from of LEG_STATUSES) {
      for (const evidence of ALL_EVIDENCE) {
        if (canTransitionLeg(from, "confirmed", evidence)) fills.push({ from, evidence });
      }
    }
    expect(fills).toEqual([
      { from: "submitted", evidence: "chain_success" },
      { from: "unknown", evidence: "chain_success" },
    ]);
  });
});
