import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { USDC_MINT } from "../assets/allowlist";
import type { ChainReader, TransactionDetail } from "../execution/chain";

import { readFunding, usdcRaw } from "./funding";
import { associatedTokenAddress, fundingInstructions } from "./funding-tx";

/*
 * A designated test stub of the chain. Production passes the real reader from
 * src/server/execution/chainReader.ts; nothing outside a test file constructs one of these.
 */
const SENDER = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const DEST = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const SIG = "5".repeat(88);

function chainWith(opts: {
  status?: "confirmed" | "finalized" | "processed" | null | "unreadable";
  err?: unknown;
  sent?: bigint;
  received?: bigint;
  sender?: string;
  dest?: string;
  mint?: string;
  detail?: "unreadable";
}): ChainReader {
  const mint = opts.mint ?? USDC_MINT;
  const tx: TransactionDetail = {
    slot: 300_000_000,
    blockTime: 1_790_000_000,
    signatures: [SIG],
    err: opts.err ?? null,
    fee: 5000,
    preTokenBalances: [
      { accountIndex: 1, mint, owner: opts.sender ?? SENDER, uiTokenAmount: { amount: "100000000", decimals: 6 } },
    ],
    postTokenBalances: [
      { accountIndex: 1, mint, owner: opts.sender ?? SENDER, uiTokenAmount: { amount: String(100_000_000n - (opts.sent ?? 25_000_000n)), decimals: 6 } },
      { accountIndex: 2, mint, owner: opts.dest ?? DEST, uiTokenAmount: { amount: String(opts.received ?? 25_000_000n), decimals: 6 } },
    ],
  };
  return {
    async getSignatureStatuses() {
      if (opts.status === "unreadable") return null;
      if (opts.status === null) return [null];
      return [{ slot: tx.slot, confirmationStatus: opts.status ?? "confirmed", err: opts.err ?? null }];
    },
    async getTransaction() {
      return opts.detail === "unreadable" ? null : tx;
    },
    async getSignaturesForAddress() { return []; },
    async isBlockhashValid() { return true; },
    async getSlot() { return tx.slot; },
  };
}

const expect25 = { signature: SIG, senderWallet: SENDER, destinationWallet: DEST, amountRaw: usdcRaw(25) };

describe("funding evidence", () => {
  it("funds on a confirmed exact transfer from the sender to the destination", async () => {
    expect(await readFunding(expect25, chainWith({}))).toEqual({ outcome: "funded", slot: 300_000_000, blockTime: 1_790_000_000 });
  });

  it("accepts finalized as well as confirmed", async () => {
    expect((await readFunding(expect25, chainWith({ status: "finalized" }))).outcome).toBe("funded");
  });

  /* The sender was shown one number and signed it. Any other number is a different act. */
  it("refuses an underpayment and an overpayment alike", async () => {
    expect(await readFunding(expect25, chainWith({ sent: 20_000_000n, received: 20_000_000n }))).toEqual({ outcome: "mismatch", reason: "wrong_amount" });
    expect(await readFunding(expect25, chainWith({ sent: 30_000_000n, received: 30_000_000n }))).toEqual({ outcome: "mismatch", reason: "wrong_amount" });
  });

  it("refuses a transfer to somewhere else", async () => {
    expect(await readFunding(expect25, chainWith({ dest: "So11111111111111111111111111111111111111112" }))).toEqual({ outcome: "mismatch", reason: "wrong_destination" });
  });

  it("refuses a third party's transfer to the same wallet", async () => {
    expect(await readFunding(expect25, chainWith({ sender: "So11111111111111111111111111111111111111112" }))).toEqual({ outcome: "mismatch", reason: "wrong_sender" });
  });

  it("refuses a transfer of a different token", async () => {
    expect(await readFunding(expect25, chainWith({ mint: "So11111111111111111111111111111111111111112" }))).toEqual({ outcome: "mismatch", reason: "not_usdc" });
  });

  it("refuses a transaction that failed on chain", async () => {
    expect(await readFunding(expect25, chainWith({ err: { InstructionError: [1, "Custom"] } }))).toEqual({ outcome: "mismatch", reason: "failed_on_chain" });
  });

  /* The case this whole module exists for: not knowing is not failing. A gift in this state is
     never offered a second transfer. */
  it("reports uncertainty, not failure, when the chain cannot yet say", async () => {
    expect(await readFunding(expect25, chainWith({ status: "unreadable" }))).toEqual({ outcome: "uncertain", reason: "status_unreadable" });
    expect(await readFunding(expect25, chainWith({ status: null }))).toEqual({ outcome: "uncertain", reason: "not_found_yet" });
    expect(await readFunding(expect25, chainWith({ status: "processed" }))).toEqual({ outcome: "uncertain", reason: "not_confirmed" });
    expect(await readFunding(expect25, chainWith({ detail: "unreadable" }))).toEqual({ outcome: "uncertain", reason: "detail_unreadable" });
  });

  it("converts whole dollars to USDC base units and refuses anything else", () => {
    expect(usdcRaw(25)).toBe(25_000_000n);
    expect(() => usdcRaw(0)).toThrow();
    expect(() => usdcRaw(10.5)).toThrow();
  });
});

describe("funding transaction", () => {
  it("creates the recipient's USDC account, transfers the exact amount, then the SOL allowance", () => {
    const ix = fundingInstructions({ sender: SENDER, destination: DEST, amountRaw: 25_000_000n, solLamports: 10_000_000n });
    expect(ix).toHaveLength(3);

    const ata = associatedTokenAddress(new PublicKey(DEST), new PublicKey(USDC_MINT)).toBase58();
    expect(ix[0].keys[1].pubkey.toBase58()).toBe(ata); // idempotent create for the recipient
    expect(ix[0].data[0]).toBe(1);

    expect(ix[1].data[0]).toBe(12); // TransferChecked
    expect(ix[1].data.readBigUInt64LE(1)).toBe(25_000_000n);
    expect(ix[1].data[9]).toBe(6);
    expect(ix[1].keys[2].pubkey.toBase58()).toBe(ata);
    expect(ix[1].keys[3].pubkey.toBase58()).toBe(SENDER);
    expect(ix[1].keys[3].isSigner).toBe(true);

    expect(ix[2].keys[1].pubkey.toBase58()).toBe(DEST); // SOL allowance
  });
});
