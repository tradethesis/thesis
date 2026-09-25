import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "./db/client";
import { asset, fill, investmentIntent, swapLeg, thesis, thesisVersion } from "./db/schema";

/**
 * What a wallet has actually bought, read for one wallet only.
 *
 * Deliberately called purchase history and not holdings. Every row here is a record of
 * something this app did at a moment in the past; none of it is evidence of what the wallet
 * contains now. The tokens can be sold, transferred, or seized by the issuer without this
 * database ever hearing about it, so presenting old fills as a current portfolio — or
 * deriving a profit and loss from them — would be a claim we cannot support.
 *
 * The wallet is never taken from the request. It comes from the authenticated session, and
 * every query below filters on it.
 */

export type PurchaseLeg = {
  symbol: string;
  company: string;
  /** Null until the leg fills. */
  filledOutRaw: string | null;
  decimals: number;
  plannedInRaw: string;
  status: string;
  signature: string | null;
};

export type Purchase = {
  intentId: string;
  slug: string;
  claim: string;
  /** "simulation" rows never touched a chain. The distinction is the whole point. */
  executionMode: "simulation" | "live";
  status: string;
  /** Legs that confirmed, out of legs planned. A basket can stop part-way. */
  confirmedLegs: number;
  totalLegs: number;
  /** True while any leg may still land, so the row must not read as finished. */
  settling: boolean;
  /** Null on a draft that never got an amount. */
  budgetRaw: string | null;
  createdAt: string;
  legs: PurchaseLeg[];
};

/** Legs whose outcome is still unknown. A basket holding one of these is not finished. */
const UNSETTLED = ["submitted", "unknown", "awaiting_signature", "quoted", "planned"];

export async function listPurchases(wallet: string): Promise<Purchase[]> {
  const intents = await db
    .select({
      id: investmentIntent.id,
      status: investmentIntent.status,
      executionMode: investmentIntent.executionMode,
      budgetRaw: investmentIntent.budgetRaw,
      createdAt: investmentIntent.createdAt,
      slug: thesis.slug,
      claim: thesisVersion.claim,
    })
    .from(investmentIntent)
    .innerJoin(thesisVersion, eq(investmentIntent.thesisVersionId, thesisVersion.id))
    .innerJoin(thesis, eq(thesisVersion.thesisId, thesis.id))
    // The only place the wallet is applied, and it comes from the session.
    .where(eq(investmentIntent.wallet, wallet))
    .orderBy(desc(investmentIntent.createdAt))
    .limit(100);

  if (!intents.length) return [];

  const ids = intents.map((i) => i.id);

  const legs = await db
    .select({
      intentId: swapLeg.intentId,
      status: swapLeg.status,
      plannedInRaw: swapLeg.plannedInRaw,
      symbol: asset.symbol,
      company: asset.company,
      decimals: asset.decimals,
    })
    .from(swapLeg)
    .innerJoin(asset, eq(swapLeg.assetId, asset.id))
    .where(inArray(swapLeg.intentId, ids))
    .orderBy(swapLeg.legIndex);

  // Fills are filtered by wallet as well as by intent. The join already constrains it, but a
  // row that disagreed with its intent's owner is exactly the row worth not returning.
  const fills = await db
    .select({ intentId: fill.intentId, outputMint: fill.outputMint, outRaw: fill.outRaw, signature: fill.signature })
    .from(fill)
    .where(and(inArray(fill.intentId, ids), eq(fill.wallet, wallet)));

  const mintSymbol = new Map(
    (await db.select({ mint: asset.mint, symbol: asset.symbol }).from(asset)).map((a) => [a.mint, a.symbol]),
  );
  const fillBySymbol = new Map(
    fills.map((f) => [`${f.intentId}:${mintSymbol.get(f.outputMint) ?? f.outputMint}`, f]),
  );

  return intents.map((intent) => {
    const mine = legs.filter((l) => l.intentId === intent.id);
    const rows: PurchaseLeg[] = mine.map((l) => {
      const found = fillBySymbol.get(`${intent.id}:${l.symbol}`);
      return {
        symbol: l.symbol,
        company: l.company,
        decimals: l.decimals,
        plannedInRaw: l.plannedInRaw,
        status: l.status,
        filledOutRaw: found?.outRaw ?? null,
        signature: found?.signature ?? null,
      };
    });

    return {
      intentId: intent.id,
      slug: intent.slug,
      claim: intent.claim,
      executionMode: intent.executionMode === "live" ? "live" : "simulation",
      status: intent.status,
      confirmedLegs: rows.filter((l) => l.status === "confirmed").length,
      totalLegs: rows.length,
      settling: rows.some((l) => UNSETTLED.includes(l.status)),
      budgetRaw: intent.budgetRaw,
      createdAt: intent.createdAt.toISOString(),
      legs: rows,
    };
  });
}
