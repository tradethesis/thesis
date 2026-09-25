import { and, count, desc, eq, inArray } from "drizzle-orm";

import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT, assetByMint } from "./assets/allowlist";
import { db } from "./db/client";
import { asset, fill, investmentIntent, swapLeg, thesis, thesisVersion } from "./db/schema";
import { litePrices } from "./jupiter/client";
import { rpc } from "./solana/rpc";
import { displayAmount, valueHoldings, valueTheses, type Portfolio, type Price } from "@/lib/portfolio";

/**
 * One wallet's portfolio: what it holds on chain now, and what each purchase bought, both at
 * today's prices.
 *
 * Balances come from the chain, never from this app's records: the database knows what it
 * bought, not what is still there. Only allowlisted mints are shown — a wallet can hold any
 * token anybody sends it, and listing an airdropped lookalike under a real company's name is
 * exactly the confusion the allowlist exists to prevent.
 *
 * The wallet comes from the session (see the route). Nothing here reads it from a request.
 */

type ParsedAccount = {
  account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } };
};

/** Token balances for both SPL programs, summed per mint. Throws if the chain can't be read. */
async function balancesOf(wallet: string): Promise<Map<string, { raw: bigint; decimals: number }>> {
  const programs = [TOKEN_PROGRAM, TOKEN_2022_PROGRAM];
  const results = await Promise.all(
    programs.map((programId) =>
      rpc<{ value: ParsedAccount[] } | null>("getTokenAccountsByOwner", [wallet, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }]),
    ),
  );
  const out = new Map<string, { raw: bigint; decimals: number }>();
  for (const result of results) {
    // Rule 1 of the RPC client: a failed read is not an empty wallet.
    if (!result) throw new Error("wallet unreadable");
    for (const { account } of result.value) {
      const { mint, tokenAmount } = account.data.parsed.info;
      const prev = out.get(mint);
      out.set(mint, { raw: (prev?.raw ?? 0n) + BigInt(tokenAmount.amount), decimals: tokenAmount.decimals });
    }
  }
  return out;
}

export async function getPortfolio(wallet: string): Promise<Portfolio> {
  const [balances, intents] = await Promise.all([
    balancesOf(wallet),
    db
      .select({
        intentId: investmentIntent.id,
        executionMode: investmentIntent.executionMode,
        createdAt: investmentIntent.createdAt,
        slug: thesis.slug,
        claim: thesisVersion.claim,
      })
      .from(investmentIntent)
      .innerJoin(thesisVersion, eq(investmentIntent.thesisVersionId, thesisVersion.id))
      .innerJoin(thesis, eq(thesisVersion.thesisId, thesis.id))
      .where(eq(investmentIntent.wallet, wallet))
      .orderBy(desc(investmentIntent.createdAt))
      .limit(100),
  ]);

  const ids = intents.map((i) => i.intentId);
  const [fills, legCounts] = ids.length
    ? await Promise.all([
        db
          .select({
            intentId: fill.intentId,
            mint: fill.outputMint,
            inRaw: fill.inRaw,
            outRaw: fill.outRaw,
            symbol: asset.symbol,
            company: asset.company,
            decimals: asset.decimals,
          })
          .from(fill)
          .innerJoin(asset, eq(asset.mint, fill.outputMint))
          // Wallet as well as intent: a fill that disagreed with its intent's owner is the row
          // worth not returning.
          .where(and(inArray(fill.intentId, ids), eq(fill.wallet, wallet), inArray(fill.confirmationStatus, ["confirmed", "finalized"]))),
        db.select({ intentId: swapLeg.intentId, n: count() }).from(swapLeg).where(inArray(swapLeg.intentId, ids)).groupBy(swapLeg.intentId),
      ])
    : [[], []];

  // Everything shown, priced in one request.
  const held = [...balances.entries()].filter(([mint, b]) => mint !== USDC_MINT && b.raw > 0n && assetByMint(mint));
  const mints = [...new Set([...held.map(([m]) => m), ...fills.map((f) => f.mint)])];
  // A price outage leaves rows unpriced ("price unavailable"), never valued at zero.
  const feed: Awaited<ReturnType<typeof litePrices>> = mints.length ? await litePrices(mints).catch(() => new Map()) : new Map();
  const prices = new Map<string, Price>();
  for (const [mint, p] of feed) prices.set(mint, { usd: p.usdPrice, multiplier: p.scaledUiConfig?.multiplier ?? 1 });

  const { rows, holdingsUsd, unpriced } = valueHoldings(
    held.map(([mint, b]) => {
      const a = assetByMint(mint)!;
      return { mint, symbol: a.symbol, company: a.company, raw: b.raw.toString(), decimals: b.decimals };
    }),
    prices,
  );

  const usdc = balances.get(USDC_MINT);
  const cashUsd = usdc ? displayAmount(usdc.raw, usdc.decimals) : 0;

  const planned = new Map(legCounts.map((l) => [l.intentId, Number(l.n)]));
  const valued = valueTheses(
    intents.map((i) => ({
      intentId: i.intentId,
      slug: i.slug,
      claim: i.claim,
      executionMode: i.executionMode === "live" ? "live" : "simulation",
      createdAt: i.createdAt.toISOString(),
      plannedLegs: planned.get(i.intentId) ?? 0,
    })),
    fills.filter((f): f is typeof f & { intentId: string } => Boolean(f.intentId)),
    prices,
  );

  return {
    asOf: new Date().toISOString(),
    holdings: rows,
    cashUsd,
    holdingsUsd,
    totalUsd: holdingsUsd + cashUsd,
    unpriced,
    theses: valued.filter((t) => t.executionMode === "live"),
    simulated: valued.filter((t) => t.executionMode === "simulation"),
  };
}
