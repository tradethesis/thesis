import type { ChainReader } from "../execution/chain";
import { deltaFor } from "../execution/reconcile";
import { USDC_MINT } from "../assets/allowlist";

/**
 * Is this gift funded? Read the chain, not the client.
 *
 * A gift becomes `funded` only when a confirmed transaction shows the gift's exact USDC amount
 * leaving the sender's wallet and arriving at the gift's destination. The browser saying "sent"
 * is a hint about which signature to read, nothing more.
 *
 * Three outcomes, and the difference between the last two is the whole point:
 *
 *   funded     — evidence agrees with the gift in every particular.
 *   mismatch   — evidence exists and contradicts the gift. Final: the signature is not this gift's.
 *   uncertain  — we could not read enough to know. NOT a failure. The transfer may have landed, and
 *                asking the sender to send again is exactly how a gift gets funded twice.
 */

export type FundingExpectation = {
  signature: string;
  senderWallet: string;
  destinationWallet: string;
  /** Exact USDC base units (6 decimals). */
  amountRaw: bigint;
};

export type FundingEvidence =
  | { outcome: "funded"; slot: number; blockTime: number | null }
  | { outcome: "mismatch"; reason: "failed_on_chain" | "wrong_amount" | "wrong_destination" | "wrong_sender" | "not_usdc" }
  | { outcome: "uncertain"; reason: "status_unreadable" | "not_found_yet" | "not_confirmed" | "detail_unreadable" };

export async function readFunding(expect: FundingExpectation, chain: ChainReader): Promise<FundingEvidence> {
  const statuses = await chain.getSignatureStatuses([expect.signature]);
  if (statuses === null) return { outcome: "uncertain", reason: "status_unreadable" };

  const status = statuses[0];
  if (!status) return { outcome: "uncertain", reason: "not_found_yet" };
  if (status.err) return { outcome: "mismatch", reason: "failed_on_chain" };
  if (status.confirmationStatus !== "confirmed" && status.confirmationStatus !== "finalized") {
    return { outcome: "uncertain", reason: "not_confirmed" };
  }

  const tx = await chain.getTransaction(expect.signature);
  if (!tx) return { outcome: "uncertain", reason: "detail_unreadable" };
  if (tx.err) return { outcome: "mismatch", reason: "failed_on_chain" };

  const received = deltaFor(tx, expect.destinationWallet, USDC_MINT);
  const sent = deltaFor(tx, expect.senderWallet, USDC_MINT);

  // The transaction does not touch USDC for these wallets at all.
  if (received === null && sent === null) return { outcome: "mismatch", reason: "not_usdc" };
  if (received === null || received <= 0n) return { outcome: "mismatch", reason: "wrong_destination" };
  if (sent === null || sent >= 0n) return { outcome: "mismatch", reason: "wrong_sender" };
  /*
   * Exact, not "at least". An overpayment is still not this gift: the sender was shown one number
   * and signed it, and a transfer for a different number is a different act. The sender's side is
   * checked for the same amount so a third party's transfer to the same wallet cannot fund it.
   */
  if (received !== expect.amountRaw || -sent !== expect.amountRaw) return { outcome: "mismatch", reason: "wrong_amount" };

  return { outcome: "funded", slot: tx.slot, blockTime: tx.blockTime };
}

/** Whole dollars to USDC base units. Gift budgets are whole dollars by schema. */
export function usdcRaw(dollars: number): bigint {
  if (!Number.isInteger(dollars) || dollars <= 0) throw new Error("Gift amount must be a positive whole dollar figure.");
  return BigInt(dollars) * 1_000_000n;
}
