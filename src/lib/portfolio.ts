/**
 * Valuing a portfolio: pure arithmetic, shared by the server that computes it and the page that
 * renders it.
 *
 * Two different questions, kept apart on purpose:
 *
 *  - **What you hold** is read from the chain: the wallet's token balances right now, times
 *    today's price. It is the only honest answer to "how much do I have", because tokens can be
 *    sold or moved without this app hearing about it.
 *  - **By thesis** values what each purchase bought, at today's prices. It answers "how is this
 *    idea doing for me", and says so: it is not a claim that those exact tokens are still there.
 *
 * A missing or zero price is never a value of zero. The row says "price unavailable" and is left
 * out of every total, and the total says it left something out.
 */

export type Price = {
  /** US dollars per displayed token. */
  usd: number;
  /** Issuer's scaled-UI multiplier (xStocks rebase for dividends and splits). 1 when absent. */
  multiplier: number;
};

export type HoldingRow = {
  mint: string;
  symbol: string;
  company: string;
  /** Displayed token amount: base units, decimals, multiplier. */
  amount: number;
  /** Null: no usable price. Never 0 standing in for "unknown". */
  priceUsd: number | null;
  valueUsd: number | null;
};

export type ThesisRow = {
  intentId: string;
  slug: string;
  claim: string;
  executionMode: "live" | "simulation";
  createdAt: string;
  /** USDC spent on the holdings that confirmed. */
  putInUsd: number;
  /** What those confirmed holdings are worth at today's prices. Null if any of them is unpriced. */
  nowUsd: number | null;
  changeUsd: number | null;
  changePct: number | null;
  holdings: { symbol: string; company: string; amount: number; valueUsd: number | null }[];
  /** Holdings planned but not bought (failed, cancelled or still settling). */
  missing: number;
};

export type Portfolio = {
  asOf: string;
  /** Stocks and other allowlisted tokens held right now, largest first. */
  holdings: HoldingRow[];
  cashUsd: number;
  holdingsUsd: number;
  totalUsd: number;
  /** Tokens held but not valued, so the total is known to be short of the truth. */
  unpriced: number;
  /** Real purchases only. Simulations are listed apart and never counted. */
  theses: ThesisRow[];
  simulated: ThesisRow[];
};

/** Base units to the amount a person sees, including the issuer's multiplier. */
export function displayAmount(raw: string | bigint, decimals: number, multiplier = 1): number {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
}

/** A usable price, or null. A zero, a negative or a NaN is not a price. */
export function usable(price: Price | undefined): Price | null {
  return price && Number.isFinite(price.usd) && price.usd > 0 ? price : null;
}

export function valueHoldings(
  balances: { mint: string; symbol: string; company: string; raw: string; decimals: number }[],
  prices: Map<string, Price>,
): { rows: HoldingRow[]; holdingsUsd: number; unpriced: number } {
  const rows: HoldingRow[] = [];
  for (const b of balances) {
    if (BigInt(b.raw) <= 0n) continue;
    const price = usable(prices.get(b.mint));
    const amount = displayAmount(b.raw, b.decimals, price?.multiplier ?? 1);
    rows.push({
      mint: b.mint,
      symbol: b.symbol,
      company: b.company,
      amount,
      priceUsd: price?.usd ?? null,
      valueUsd: price ? amount * price.usd : null,
    });
  }
  // Largest first; unpriced rows last, since they cannot be ranked.
  rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  return {
    rows,
    holdingsUsd: rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0),
    unpriced: rows.filter((r) => r.valueUsd === null).length,
  };
}

export type FillForValue = {
  intentId: string;
  mint: string;
  symbol: string;
  company: string;
  decimals: number;
  inRaw: string;
  outRaw: string;
};

export type IntentForValue = {
  intentId: string;
  slug: string;
  claim: string;
  executionMode: "live" | "simulation";
  createdAt: string;
  plannedLegs: number;
};

/** One row per purchase: USDC put in, and what it bought valued at today's prices. */
export function valueTheses(intents: IntentForValue[], fills: FillForValue[], prices: Map<string, Price>): ThesisRow[] {
  const out: ThesisRow[] = [];
  for (const intent of intents) {
    const mine = fills.filter((f) => f.intentId === intent.intentId);
    if (!mine.length) continue; // nothing bought: history, not a position
    const holdings = mine.map((f) => {
      const price = usable(prices.get(f.mint));
      const amount = displayAmount(f.outRaw, f.decimals, price?.multiplier ?? 1);
      return { symbol: f.symbol, company: f.company, amount, valueUsd: price ? amount * price.usd : null };
    });
    const putInUsd = mine.reduce((s, f) => s + Number(BigInt(f.inRaw)) / 1e6, 0);
    const nowUsd = holdings.some((h) => h.valueUsd === null) ? null : holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    const changeUsd = nowUsd === null ? null : nowUsd - putInUsd;
    out.push({
      ...intent,
      putInUsd,
      nowUsd,
      changeUsd,
      changePct: changeUsd === null || putInUsd <= 0 ? null : (changeUsd / putInUsd) * 100,
      holdings,
      missing: Math.max(0, intent.plannedLegs - mine.length),
    });
  }
  return out;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dollars. Under a cent keeps two significant digits, so a $1 gift's moves don't read as zero. */
export function formatUsd(n: number): string {
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) {
    return (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumSignificantDigits: 2 });
  }
  return USD.format(n).replace("-", "−");
}

export function formatSignedUsd(n: number): string {
  return (n > 0 ? "+" : "") + formatUsd(n);
}

/** Token amounts: small holdings keep their significant digits instead of reading "0.00". */
export function formatAmount(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** A per-token price: a $0.0004 token keeps its digits, a $180 stock shows cents. */
export function formatPrice(n: number): string {
  if (n >= 1) return USD.format(n);
  return "$" + n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}
