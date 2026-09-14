import { env } from "../env";

/**
 * Jupiter client.
 *
 * Two base URLs, deliberately split:
 *
 *  - lite-api.jup.ag/swap/v1/quote is free and generous. It serves display pricing and
 *    position valuation, which poll far more often than anyone trades.
 *  - api.jup.ag/swap/v2/{order,execute} is keyed and finite. It is reserved for orders a
 *    user is about to sign. A valuation poll must never be able to starve execution.
 *
 * Measured 2026-09-14: keyless api.jup.ag 429s after about four rapid calls; with the key,
 * five back-to-back order calls all returned 200.
 *
 * A plain User-Agent is set explicitly because the edge rejects some default agents with
 * a 403 that looks nothing like a rate limit.
 */

const LITE_BASE = "https://lite-api.jup.ag";
const KEYED_BASE = "https://api.jup.ag";
const UA = "thesis-app/0.1 (+https://github.com/limon-wq)";

export class JupiterError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly transient: boolean,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "JupiterError";
  }
}

async function call<T>(url: string, init: RequestInit & { keyed?: boolean; timeoutMs?: number }): Promise<T> {
  const { keyed, timeoutMs = 20_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        accept: "application/json",
        "user-agent": UA,
        ...(keyed ? { "x-api-key": env.jupApiKey() } : {}),
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      throw new JupiterError(
        `jupiter ${res.status} ${typeof parsed === "string" ? parsed.slice(0, 160) : JSON.stringify(parsed).slice(0, 160)}`,
        res.status,
        res.status === 429 || res.status >= 500,
        parsed,
      );
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof JupiterError) throw error;
    // AbortError and network failures are transient by definition: we do not know
    // whether the far side acted. That distinction is the whole reconciliation story.
    throw new JupiterError(`jupiter request failed: ${(error as Error).message}`, null, true);
  } finally {
    clearTimeout(timer);
  }
}

export type JupiterToken = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidity?: number;
  tokenProgram?: string;
};

/**
 * Search is used for verification only — to confirm a mint we already trust still looks
 * right — never to resolve an asset. Querying "NVDAx" returns four pump.fun clones.
 */
export async function searchTokens(query: string): Promise<JupiterToken[]> {
  const result = await call<JupiterToken[] | { tokens?: JupiterToken[] }>(
    `${LITE_BASE}/tokens/v2/search?query=${encodeURIComponent(query)}`,
    { method: "GET" },
  );
  return Array.isArray(result) ? result : (result.tokens ?? []);
}

export type LiteQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  swapMode: string;
  routePlan: { swapInfo: { label: string } }[];
};

/** Free-tier quote. Display and valuation only — it cannot produce a signable order. */
export async function liteQuote(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
}): Promise<LiteQuote> {
  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountRaw.toString(),
    slippageBps: String(params.slippageBps ?? 50),
  });
  return call<LiteQuote>(`${LITE_BASE}/swap/v1/quote?${search.toString()}`, { method: "GET" });
}

export type JupiterOrder = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  feeBps: number;
  feeMint: string;
  platformFee?: { feeBps: number; feeMint: string } | null;
  gasless: boolean;
  guaranteedPrice?: boolean;
  signatureFeeLamports: number;
  signatureFeePayer: string;
  prioritizationFeeLamports: number;
  prioritizationFeePayer: string;
  rentFeeLamports: number;
  rentFeePayer: string;
  requestId: string;
  quoteId?: string;
  swapType: string;
  router: string;
  mode: string;
  maker?: string;
  taker: string | null;
  /** Base64 unsigned transaction. null without a taker; "" when the build failed. */
  transaction: string | null;
  expireAt?: string;
  inUsdValue?: number;
  outUsdValue?: number;
  errorCode?: number;
  errorMessage?: string;
  routePlan?: unknown[];
};

/**
 * Assemble an order.
 *
 * `slippageBps` is deliberately never sent. Passing it flips `mode` from "ultra" to
 * "manual", which can exclude the RFQ router and hand the user a worse fill than doing
 * nothing. We read Jupiter's chosen slippage and price impact; we do not set them.
 */
export async function createOrder(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  taker?: string;
}): Promise<JupiterOrder> {
  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountRaw.toString(),
  });
  if (params.taker) search.set("taker", params.taker);
  return call<JupiterOrder>(`${KEYED_BASE}/swap/v2/order?${search.toString()}`, { method: "GET", keyed: true });
}

export type JupiterExecuteResult = {
  status: "Success" | "Failed";
  signature?: string;
  code?: number;
  error?: string;
  totalInputAmount?: string;
  totalOutputAmount?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
};

/**
 * Hand Jupiter the signed transaction. Jupiter broadcasts and lands it.
 *
 * The returned status is an identifier, not evidence. A leg becomes `confirmed` only
 * from a chain read (PRD TH-08). A thrown error here means "we do not know", never
 * "it failed" — the transaction may well be on chain.
 */
export async function executeOrder(params: {
  signedTransaction: string;
  requestId: string;
  timeoutMs?: number;
}): Promise<JupiterExecuteResult> {
  return call<JupiterExecuteResult>(`${KEYED_BASE}/swap/v2/execute`, {
    method: "POST",
    keyed: true,
    timeoutMs: params.timeoutMs ?? 20_000,
    body: JSON.stringify({ signedTransaction: params.signedTransaction, requestId: params.requestId }),
  });
}
