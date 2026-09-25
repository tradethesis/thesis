/**
 * The 12-month what-if for every terminal basket, by the same method as the gift packs
 * (scripts/pack-history.ts): the basket's current holdings at its current weights, bought and held
 * over the past year, against the S&P 500 (SPY) over the same days. No rebalancing, no fees.
 *
 * Shown only while a basket's own live record is too short to rank, and always labelled as a
 * 12-month what-if, never as the call's result. A basket holding anything without a real public
 * price history (a pre-IPO token, a liquid-staking token) is left out rather than approximated.
 *
 * Daily closes from Yahoo Finance's public chart endpoint: US listings for the tokenized stocks,
 * USD pairs for the crypto. Written to src/data/basket-history.json with its window.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/basket-history.ts
 */
import { writeFileSync } from "node:fs";

import { EQUITY_ASSETS } from "@/server/assets/allowlist";
import { listBaskets } from "@/server/baskets/queries";

type Series = { t: number[]; c: number[] };

/** Crypto with a year of public USD prices. cbBTC and WBTC are claims on bitcoin, priced as bitcoin. */
const CRYPTO_TICKER: Record<string, string> = {
  SOL: "SOL-USD",
  cbBTC: "BTC-USD",
  WBTC: "BTC-USD",
  ETH: "ETH-USD",
  JUP: "JUP29210-USD",
  RAY: "RAY-USD",
};

function tickerOf(symbol: string): string | null {
  const equity = EQUITY_ASSETS.find((a) => a.symbol === symbol);
  if (equity) return equity.underlying;
  return CRYPTO_TICKER[symbol] ?? null;
}

async function closes(ticker: string): Promise<Series> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${ticker}: ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const c: (number | null)[] = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  const t: number[] = r.timestamp;
  const keep = t.map((_, i) => i).filter((i) => c[i] != null);
  return { t: keep.map((i) => t[i]), c: keep.map((i) => c[i]!) };
}

(async () => {
  const baskets = await listBaskets();
  const spy = await closes("SPY");
  const days = spy.t; // the benchmark's trading days are the calendar for everything
  const at = (s: Series, day: number) => {
    let v = s.c[0];
    for (let i = 0; i < s.t.length && s.t[i] <= day; i++) v = s.c[i];
    return v;
  };
  const cache = new Map<string, Series>();
  const out: Record<string, { returnPct: number; benchmarkPct: number }> = {};
  for (const b of baskets) {
    const tickers = b.execution.holdings.map((h) => tickerOf(h.symbol));
    if (tickers.some((t) => t === null)) {
      console.log(`${b.name.padEnd(26)} skipped: ${b.execution.holdings.filter((h, i) => !tickers[i]).map((h) => h.symbol).join(", ")} has no public price history`);
      continue;
    }
    const series = await Promise.all(
      tickers.map(async (t) => {
        if (!cache.has(t!)) cache.set(t!, await closes(t!));
        return cache.get(t!)!;
      }),
    );
    const first = days[0];
    const last = days[days.length - 1];
    const value = b.execution.holdings.reduce((sum, h, i) => sum + (h.weightBps / 10000) * (at(series[i], last) / at(series[i], first)), 0);
    const returnPct = (value - 1) * 100;
    const benchmarkPct = (at(spy, last) / spy.c[0] - 1) * 100;
    out[b.slug] = { returnPct: +returnPct.toFixed(2), benchmarkPct: +benchmarkPct.toFixed(2) };
    console.log(`${b.name.padEnd(26)} ${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%   S&P 500 ${benchmarkPct >= 0 ? "+" : ""}${benchmarkPct.toFixed(1)}%`);
  }
  const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  writeFileSync("src/data/basket-history.json", JSON.stringify({ window: "12m", from: iso(days[0]), asOf: iso(days[days.length - 1]), benchmark: "S&P 500 (SPY)", source: "Yahoo Finance daily closes", baskets: out }, null, 1) + "\n");
  console.log(`window ${iso(days[0])} → ${iso(days[days.length - 1])}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
