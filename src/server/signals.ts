import { eq, inArray } from "drizzle-orm";

import type { CallRecord } from "@/lib/calls";

import { db } from "./db/client";
import { litePrices } from "./jupiter/client";
import { asset, thesis, thesisConstituent, thesisVersion } from "./db/schema";

export type AssetSignal = {
  symbol: string;
  company: string;
  mint: string;
  /** How many published baskets hold it. This is the signal, and it sizes the tile. */
  baskets: number;
  /** Summed weight across those baskets, in basis points. Breaks ties. */
  weightBps: number;
  /** Percent change since the calls holding it were struck. Null when nothing has moved. */
  changePercent: number | null;
  /** Spot price in USD, from the price feed rather than a swap quote. */
  usdPrice: number | null;
  /** Last 24 hours, percent. */
  change24h: number | null;
  /**
   * Market capitalisation, for tokenised equities only.
   *
   * Crypto assets have no share count and no issuer publishing one, so this is null for
   * them rather than a figure derived from circulating supply — the two are different
   * quantities and putting them in one column would compare them as if they were not.
   */
  mcapUsd: number | null;
};

/**
 * Which assets the catalogue is pointing at, and how they have moved.
 *
 * Two facts, deliberately not the same one twice. Size says how many different arguments
 * arrive at this asset — that is the signal, and it is a fact about what people believe.
 * Colour says what the price has done since those arguments were made — a fact about the
 * world. An asset can be heavily signalled and falling, and that combination is the most
 * interesting thing this view can show; encoding both from one number would hide it.
 *
 * The change is derived from the call snapshots we already store rather than a fresh quote:
 * each snapshot holds a fixed token amount and its USDC value, so the ratio of the two
 * observations is that asset's move over exactly the window the call has been running.
 * Averaged across every call holding it, and null when no call has a second observation.
 */
export async function assetSignals(calls: CallRecord[]): Promise<AssetSignal[]> {
  const rows = await db
    .select({
      symbol: asset.symbol,
      company: asset.company,
      mint: asset.mint,
      weightBps: thesisConstituent.weightBps,
    })
    .from(thesisConstituent)
    .innerJoin(asset, eq(asset.id, thesisConstituent.assetId))
    .innerJoin(thesisVersion, eq(thesisVersion.id, thesisConstituent.versionId))
    .innerJoin(thesis, eq(thesis.currentVersionId, thesisVersion.id))
    .where(inArray(thesis.status, ["published"]));

  const byMint = new Map<string, AssetSignal>();
  for (const row of rows) {
    const entry = byMint.get(row.mint) ?? {
      symbol: row.symbol,
      company: row.company,
      mint: row.mint,
      baskets: 0,
      weightBps: 0,
      changePercent: null,
      usdPrice: null,
      change24h: null,
      mcapUsd: null,
    };
    entry.baskets += 1;
    entry.weightBps += row.weightBps;
    byMint.set(row.mint, entry);
  }

  const moves = new Map<string, number[]>();
  for (const call of calls) {
    if (call.start.observedAt === call.latest.observedAt) continue;
    const start = new Map(call.start.quotes.map((q) => [q.mint, q.outRaw]));
    for (const quote of call.latest.quotes) {
      const before = start.get(quote.mint);
      if (!before) continue;
      const from = Number(before);
      const to = Number(quote.outRaw);
      if (!(from > 0) || !(to > 0)) continue;
      const list = moves.get(quote.mint) ?? [];
      list.push((to / from - 1) * 100);
      moves.set(quote.mint, list);
    }
  }

  for (const [mint, list] of moves) {
    const entry = byMint.get(mint);
    if (entry && list.length) entry.changePercent = list.reduce((a, b) => a + b, 0) / list.length;
  }

  // One request for every asset on the map, rather than a quote per holding.
  const prices = await litePrices([...byMint.keys()]).catch(() => new Map());
  for (const [mint, price] of prices) {
    const entry = byMint.get(mint);
    if (!entry) continue;
    entry.usdPrice = price.usdPrice ?? null;
    entry.change24h = Number.isFinite(price.priceChange24h) ? (price.priceChange24h as number) : null;
    entry.mcapUsd = Number.isFinite(price.stockData?.mcap) ? (price.stockData!.mcap as number) : null;
  }

  return [...byMint.values()].sort((a, b) => b.baskets - a.baskets || b.weightBps - a.weightBps);
}
