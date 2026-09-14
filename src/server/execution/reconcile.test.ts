import { describe, expect, it } from "vitest";
import type { AddressSignature, ChainReader, SignatureStatus, TransactionDetail } from "./chain";
import { reconcileLeg, deltaFor, matchesLeg, type LegForReconcile } from "./reconcile";

const WALLET = "38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const ATA = "TokenAccountOfOursForNVDAx11111111111111111";
const TAKER_SIG = "5y3wJrLGo2FjbAuixrbV7avkF8P3MrXsqJo24qkEXK68h7noBhL9y3CgnAeWvcyXAdjE4THu8qoz5J4vdJsKpcPa";
const JUP_SIG = "JupiterFeePayerSignature1111111111111111111111111111111111111111111111111111111111111111";

const leg = (over: Partial<LegForReconcile> = {}): LegForReconcile => ({
  id: "leg-1",
  status: "unknown",
  wallet: WALLET,
  inputMint: USDC,
  outputMint: NVDAX,
  plannedInRaw: 25_000_000n,
  derivedSignature: null,
  takerSignature: TAKER_SIG,
  providerSignature: null,
  recentBlockhash: "BlockHash1111111111111111111111111111111111",
  preflightSlot: 1000n,
  outputTokenAccount: ATA,
  lastScannedSignature: null,
  ...over,
});

const tx = (over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  slot: 1010,
  blockTime: 1_789_373_000,
  signatures: [JUP_SIG, "GasPayerSig", TAKER_SIG],
  err: null,
  fee: 15_000,
  preTokenBalances: [
    { accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "40000000", decimals: 6 } },
  ],
  postTokenBalances: [
    { accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "15000000", decimals: 6 } },
    { accountIndex: 2, mint: NVDAX, owner: WALLET, uiTokenAmount: { amount: "7689755", decimals: 8 } },
  ],
  ...over,
});

/** A chain that answers only what each test sets up; everything else is "cannot tell". */
function fakeChain(setup: {
  statuses?: Record<string, SignatureStatus | null>;
  transactions?: Record<string, TransactionDetail>;
  addressSignatures?: Record<string, AddressSignature[]>;
  blockhashValid?: boolean | null;
  failLookups?: boolean;
}): ChainReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getSignatureStatuses(sigs) {
      calls.push(`getSignatureStatuses(${sigs.join(",")})`);
      if (setup.failLookups) return null;
      if (!setup.statuses) return null;
      return sigs.map((s) => setup.statuses![s] ?? null);
    },
    async getTransaction(sig) {
      calls.push(`getTransaction(${sig.slice(0, 8)})`);
      if (setup.failLookups) return null;
      return setup.transactions?.[sig] ?? null;
    },
    async getSignaturesForAddress(address) {
      calls.push(`getSignaturesForAddress(${address.slice(0, 8)})`);
      if (setup.failLookups) return null;
      return setup.addressSignatures?.[address] ?? [];
    },
    async isBlockhashValid() {
      calls.push("isBlockhashValid");
      if (setup.failLookups) return null;
      return setup.blockhashValid ?? true;
    },
    async getSlot() {
      return 1020;
    },
  };
}

describe("reading what actually happened", () => {
  it("computes deltas from the transaction's own balances", () => {
    expect(deltaFor(tx(), WALLET, USDC)).toBe(-25_000_000n);
    expect(deltaFor(tx(), WALLET, NVDAX)).toBe(7_689_755n);
  });

  it("returns null, not zero, when a mint is absent from both sides", () => {
    expect(deltaFor(tx(), WALLET, "SomeOtherMint")).toBeNull();
  });

  it("treats a token account created by this transaction as a zero pre-balance", () => {
    // NVDAx has no pre balance above: the ATA did not exist before the swap.
    expect(deltaFor(tx(), WALLET, NVDAX)).toBe(7_689_755n);
  });

  it("does not match a transaction that spends more than we planned", () => {
    const greedy = tx({
      preTokenBalances: [{ accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "99000000", decimals: 6 } }],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "0", decimals: 6 } },
        { accountIndex: 2, mint: NVDAX, owner: WALLET, uiTokenAmount: { amount: "7689755", decimals: 8 } },
      ],
    });
    expect(matchesLeg(greedy, leg())).toBe(false);
  });
});

describe("W1 signature witness", () => {
  it("confirms from a chain read when we can name the transaction", async () => {
    const chain = fakeChain({
      statuses: { [JUP_SIG]: { slot: 1010, confirmationStatus: "finalized", err: null } },
      transactions: { [JUP_SIG]: tx() },
    });
    const out = await reconcileLeg(leg({ providerSignature: JUP_SIG }), chain);
    expect(out.resolution).toBe("confirmed");
    if (out.resolution !== "confirmed") return;
    expect(out.witness).toBe("signature");
    expect(out.fill.inRaw).toBe(25_000_000n);
    expect(out.fill.outRaw).toBe(7_689_755n);
    expect(out.fill.amountSource).toBe("chain_delta");
    expect(out.fill.confirmationStatus).toBe("finalized");
  });

  it("fails a leg only on a landed transaction that errored", async () => {
    const chain = fakeChain({
      statuses: { [JUP_SIG]: { slot: 1010, confirmationStatus: "confirmed", err: { InstructionError: [2, "Custom"] } } },
      transactions: { [JUP_SIG]: tx({ err: { InstructionError: [2, "Custom"] } }) },
    });
    const out = await reconcileLeg(leg({ providerSignature: JUP_SIG }), chain);
    expect(out.resolution).toBe("failed");
  });

  it("says nothing when the signature is simply not found yet", async () => {
    const chain = fakeChain({ statuses: {}, blockhashValid: true });
    const out = await reconcileLeg(leg({ providerSignature: JUP_SIG }), chain);
    expect(out.resolution).toBe("inconclusive");
  });
});

describe("W2 activity witness — the gasless case", () => {
  it("finds our transaction by our own signature bytes when we cannot name the txid", async () => {
    const chain = fakeChain({
      addressSignatures: { [ATA]: [{ signature: JUP_SIG, slot: 1010, err: null, blockTime: 1 }] },
      transactions: { [JUP_SIG]: tx() },
    });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).toBe("confirmed");
    if (out.resolution !== "confirmed") return;
    expect(out.witness).toBe("activity");
    expect(out.fill.signature).toBe(JUP_SIG);
  });

  it("ignores a transaction on the same account that is not ours", async () => {
    const someoneElse = tx({ signatures: [JUP_SIG, "GasPayerSig", "SomeoneElsesSignature"] });
    const chain = fakeChain({
      addressSignatures: { [ATA]: [{ signature: JUP_SIG, slot: 1010, err: null, blockTime: 1 }] },
      transactions: { [JUP_SIG]: someoneElse },
      blockhashValid: true,
    });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).toBe("inconclusive");
  });

  it("ignores activity from before we ever prepared the order", async () => {
    const chain = fakeChain({
      addressSignatures: { [ATA]: [{ signature: JUP_SIG, slot: 900, err: null, blockTime: 1 }] },
      transactions: { [JUP_SIG]: tx({ slot: 900 }) },
      blockhashValid: true,
    });
    const out = await reconcileLeg(leg({ preflightSlot: 1000n }), chain);
    expect(out.resolution).toBe("inconclusive");
  });
});

describe("W3 expiry witness", () => {
  it("expires a leg only once the blockhash is proven dead", async () => {
    const chain = fakeChain({ blockhashValid: false });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).toBe("expired");
  });

  it("keeps waiting while the blockhash still lives", async () => {
    const chain = fakeChain({ blockhashValid: true });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).toBe("inconclusive");
  });

  it("runs only after the other two witnesses found nothing", async () => {
    // A transaction that landed, and an expired blockhash. Confirmed must win.
    const chain = fakeChain({
      addressSignatures: { [ATA]: [{ signature: JUP_SIG, slot: 1010, err: null, blockTime: 1 }] },
      transactions: { [JUP_SIG]: tx() },
      blockhashValid: false,
    });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).toBe("confirmed");
    expect(chain.calls).not.toContain("isBlockhashValid");
  });
});

describe("an RPC outage is not an answer", () => {
  it("resolves nothing when every lookup fails", async () => {
    const chain = fakeChain({ failLookups: true });
    const out = await reconcileLeg(leg({ providerSignature: JUP_SIG }), chain);
    expect(out.resolution).toBe("inconclusive");
  });

  it("never expires a leg because the blockhash lookup failed", async () => {
    const chain = fakeChain({ failLookups: true, blockhashValid: false });
    const out = await reconcileLeg(leg(), chain);
    expect(out.resolution).not.toBe("expired");
  });
});

describe("scope", () => {
  it("refuses to reconcile a leg that is already settled", async () => {
    const chain = fakeChain({ blockhashValid: false });
    for (const status of ["confirmed", "failed", "expired", "cancelled", "quoted"] as const) {
      const out = await reconcileLeg(leg({ status }), chain);
      expect(out.resolution).toBe("inconclusive");
    }
    expect(chain.calls).toHaveLength(0);
  });
});
