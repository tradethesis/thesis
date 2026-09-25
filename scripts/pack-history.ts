/**
 * The 12-month what-if behind each pack card: what the pack's current holdings, at its current
 * weights, would have done over the past year, against the S&P 500 (SPY) over the same days.
 *
 * One window for every pack, fixed, not chosen per pack. Daily adjusted closes of the underlying
 * US listings (the tokenized stocks track them), from Yahoo Finance's public chart endpoint.
 * Buy-and-hold from the first day: no rebalancing, no fees. Written to src/data/pack-history.json
 * with its as-of date, which the card shows.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/pack-history.ts
 */
import { writeFileSync } from "node:fs";

import { EQUITY_ASSETS } from "@/server/assets/allowlist";
import { giftCatalogue } from "@/server/gifts/catalogue";

type Series = { t: number[]; c: number[] };

async function closes(ticker: string): Promise<Series> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${ticker}: ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const c: (number | null)[] = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  const t: number[] = r.timestamp;
  const keep = t.map((_, i) => i).filter((i) => c[i] != null);
  return { t: keep.map((i) => t[i]), c: keep.map((i) => c[i]!) };
}

const underlying = (symbol: string) => EQUITY_ASSETS.find((a) => a.symbol === symbol)?.underlying ?? symbol.replace(/x$/, "");

(async () => {
  const { packs } = await giftCatalogue();
  const spy = await closes("SPY");
  const days = spy.t; // the benchmark's trading days are the calendar for everything
  const at = (s: Series, day: number) => {
    let v = s.c[0];
    for (let i = 0; i < s.t.length && s.t[i] <= day; i++) v = s.c[i];
    return v;
  };
  const out: Record<string, { returnPct: number; benchmarkPct: number; points: { basketPct: number; benchmarkPct: number }[] }> = {};
  for (const p of packs) {
    // Pre-IPO holdings have no public price history: such a pack shows its live record only.
    if (p.holdings.some((h) => !EQUITY_ASSETS.some((a) => a.symbol === h.symbol))) {
      console.log(`${p.name.padEnd(24)} skipped: holds a token with no public price history`);
      continue;
    }
    const series = await Promise.all(p.holdings.map((h) => closes(underlying(h.symbol))));
    const value = (day: number) => p.holdings.reduce((sum, h, i) => sum + (h.weightBps / 10000) * (at(series[i], day) / at(series[i], days[0])), 0);
    // Weekly points keep the file small; the last trading day is always included.
    const sample = days.filter((_, i) => i % 5 === 0 || i === days.length - 1);
    const points = sample.map((d) => ({ basketPct: (value(d) - 1) * 100, benchmarkPct: (at(spy, d) / spy.c[0] - 1) * 100 }));
    const last = points[points.length - 1];
    out[p.thesisSlug] = { returnPct: last.basketPct, benchmarkPct: last.benchmarkPct, points: points.map((x) => ({ basketPct: +x.basketPct.toFixed(2), benchmarkPct: +x.benchmarkPct.toFixed(2) })) };
    console.log(`${p.name.padEnd(24)} ${last.basketPct >= 0 ? "+" : ""}${last.basketPct.toFixed(1)}%   S&P 500 ${last.benchmarkPct >= 0 ? "+" : ""}${last.benchmarkPct.toFixed(1)}%`);
  }
  const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  writeFileSync("src/data/pack-history.json", JSON.stringify({ window: "12m", from: iso(days[0]), asOf: iso(days[days.length - 1]), benchmark: "S&P 500 (SPY)", source: "Yahoo Finance daily adjusted closes", packs: out }, null, 1) + "\n");
  console.log(`window ${iso(days[0])} → ${iso(days[days.length - 1])}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
