/**
 * The narrow slice of the chain the reconciler reads.
 *
 * An interface rather than direct RPC calls, because the reconciler is the one piece that
 * must be provably correct before any money exists, and injecting a fake chain is the only
 * way to test the cases that matter: the transaction that lands after we gave up, the one
 * that never lands, and the two reconcilers racing each other.
 *
 * Every method returns null for "we could not tell", never a zero or an empty array.
 * ~/copy-desk/desk.py learned that the hard way: an RPC outage and an empty wallet look
 * identical to a caller that cannot tell them apart.
 */

export type SignatureStatus = {
  slot: number;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  err: unknown | null;
};

export type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};

export type TransactionDetail = {
  slot: number;
  blockTime: number | null;
  signatures: string[];
  err: unknown | null;
  fee: number;
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
};

export type AddressSignature = {
  signature: string;
  slot: number;
  err: unknown | null;
  blockTime: number | null;
};

export interface ChainReader {
  /** null when the lookup itself failed; a null element means "not found yet". */
  getSignatureStatuses(signatures: string[]): Promise<(SignatureStatus | null)[] | null>;
  getTransaction(signature: string): Promise<TransactionDetail | null>;
  /** Newest first. null when the lookup failed — never an empty array on failure. */
  getSignaturesForAddress(address: string, options?: { limit?: number; until?: string }): Promise<AddressSignature[] | null>;
  /** null when the lookup failed. false means the transaction can never land. */
  isBlockhashValid(blockhash: string): Promise<boolean | null>;
  getSlot(): Promise<number | null>;
}

/** The live implementation, over the RPC client. */
export function createRpcChainReader(rpcCall: <T>(method: string, params?: unknown[]) => Promise<T>): ChainReader {
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  return {
    getSignatureStatuses: (signatures) =>
      attempt(async () => {
        const res = await rpcCall<{ value: (SignatureStatus | null)[] }>("getSignatureStatuses", [
          signatures,
          { searchTransactionHistory: true },
        ]);
        return res.value;
      }),

    getTransaction: (signature) =>
      attempt(async () => {
        const res = await rpcCall<{
          slot: number;
          blockTime: number | null;
          transaction: { signatures: string[] };
          meta: { err: unknown; fee: number; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
        } | null>("getTransaction", [signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
        if (!res || !res.meta) return null;
        return {
          slot: res.slot,
          blockTime: res.blockTime,
          signatures: res.transaction.signatures,
          err: res.meta.err ?? null,
          fee: res.meta.fee,
          preTokenBalances: res.meta.preTokenBalances ?? [],
          postTokenBalances: res.meta.postTokenBalances ?? [],
        };
      }),

    getSignaturesForAddress: (address, options) =>
      attempt(() =>
        rpcCall<AddressSignature[]>("getSignaturesForAddress", [
          address,
          { limit: options?.limit ?? 25, ...(options?.until ? { until: options.until } : {}) },
        ]),
      ),

    isBlockhashValid: (blockhash) =>
      attempt(async () => {
        const res = await rpcCall<{ value: boolean }>("isBlockhashValid", [blockhash, { commitment: "finalized" }]);
        return res.value;
      }),

    getSlot: () => attempt(() => rpcCall<number>("getSlot")),
  };
}
