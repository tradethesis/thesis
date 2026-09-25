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
const UA = "thesis-app/0.1 (+https://github.com/tradethesis)";

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
  contextSlot: number;
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
  // Backoff on the free tier's rate limit rather than surfacing it as a missing route.
  // The two are indistinguishable to every caller above this line, and they mean opposite
  // things: one is "wait", the other is "this asset cannot be traded". Striking calls on
  // fifty baskets hit this and gave up, leaving most of the catalogue with no call at all.
  // Deliberately not switched to the keyed base — that budget is reserved for orders
  // somebody is about to sign, and a valuation poll must never be able to starve it.
  return withBackoff(() => paced(() => call<LiteQuote>(`${LITE_BASE}/swap/v1/quote?${search.toString()}`, { method: "GET" })));
}

/**
 * At most one free-tier quote in flight per interval, process-wide.
 *
 * Pacing belongs here rather than in each caller. Every caller that got this wrong got it
 * wrong the same way — a Promise.all over a list — and each one had to rediscover that the
 * free tier answers a burst with 429s. A single queue means a new caller cannot reintroduce
 * the bug, and the callers that already pace themselves simply never wait.
 *
 * Only the keyless base is gated. The keyed one has its own budget and is reserved for
 * orders somebody is about to sign, which must never queue behind a valuation poll.
 */
const LITE_MIN_GAP_MS = 500;
let liteChain: Promise<void> = Promise.resolve();

function paced<T>(run: () => Promise<T>): Promise<T> {
  const turn = liteChain.then(run);
  // The chain advances on the gap, not on the request, so one slow call does not make the
  // next one wait twice. Failures are swallowed here and surface through `turn`.
  liteChain = turn.then(
    () => new Promise((resolve) => setTimeout(resolve, LITE_MIN_GAP_MS)),
    () => new Promise((resolve) => setTimeout(resolve, LITE_MIN_GAP_MS)),
  );
  return turn;
}

/**
 * Retries only what the server said was temporary, and gives up quickly rather than
 * hammering — or stalling.
 *
 * The delays are deliberately short. A call observation throws out any quote set that took
 * more than thirty seconds, because a stale set is worse than a missing one, so a generous
 * backoff here does not rescue a rate-limited observation: it converts it from "429" into
 * "not fresh enough", which is the same failure wearing a better error message. Absorbing a
 * brief limit is this function's job; staying under it is the caller's, by pacing.
 */
async function withBackoff<T>(attempt: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      const transient = error instanceof JupiterError && error.transient;
      if (!transient || i >= tries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** i));
    }
  }
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

export type LitePrice = {
  usdPrice: number;
  /** The slot the price was read at, kept on the snapshot as its provenance. */
  blockId?: number;
  priceChange24h?: number;
  liquidity?: number;
  decimals?: number;
  /** Present for tokenised equities only. Crypto has no issuer and no share count. */
  stockData?: { price?: number; mcap?: number };
  scaledUiConfig?: { multiplier?: number };
};

/**
 * Spot prices for many mints in one request.
 *
 * This is a price feed, not a swap quote, and the distinction is the whole point. Valuing a
 * basket by quoting a sale of it costs one request per holding — fifty-nine open calls is
 * roughly two hundred and forty quotes per refresh, which is well past what the free tier
 * gives one address, and the rate limit surfaces downstream as "price unavailable".
 * This endpoint answers for every mint at once, keyless, and returns the issuer's own
 * reference price and the scaled-UI multiplier alongside the market price.
 *
 * It does not replace a quote where a quote is the right tool: an order still needs to know
 * what a route will actually fill at, including impact. Use this to value and to display.
 */
export async function litePrices(mints: string[]): Promise<Map<string, LitePrice>> {
  const unique = [...new Set(mints)].filter(Boolean);
  if (!unique.length) return new Map();

  const out = new Map<string, LitePrice>();
  // The endpoint takes a list, but not an unbounded one; batching keeps a growing
  // catalogue from silently truncating its own prices.
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const body = await withBackoff(() =>
      paced(() => call<Record<string, LitePrice>>(`${LITE_BASE}/price/v3?ids=${batch.join(",")}`, { method: "GET" })),
    );
    for (const [mint, price] of Object.entries(body ?? {})) {
      if (price && Number.isFinite(price.usdPrice)) out.set(mint, price);
    }
  }
  return out;
}
