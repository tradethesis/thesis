import { desc, eq, inArray } from "drizzle-orm";

import type { SeriesPoint } from "../calls/observations";
import { loadSeries } from "../calls/observations";
import { db } from "../db/client";
import {
  asset,
  basket,
  basketConstituent,
  basketThesis,
  basketVersion,
  thesis,
  thesisCall,
  thesisConstituent,
  thesisVersion,
} from "../db/schema";

/**
 * Reading baskets for the terminal.
 *
 * Six flat queries, whatever the catalogue's size. The thing being replaced — `listPublishedTheses`
 * — runs a holdings query inside a loop, so rendering sixty theses costs sixty-one round trips.
 * Nothing here copies that.
 *
 * The shape is arranged around one rule: **anything money touches reads `execution`, and nothing
 * else.** `execution.holdings` comes from `basket_constituent`, which a deferred trigger proves
 * equal to the attached thesis's own constituents. An attached argument's prose can say whatever
 * its author believes; it cannot move a weight.
 */

export type BasketHolding = {
  mint: string;
  symbol: string;
  company: string;
  position: number;
  weightBps: number;
  /** From the origin argument only. Null rather than borrowed from somebody else's. */
  role: string | null;
  why: string | null;
  limitation: string | null;
  /** False when the asset is disabled or not mainnet. The basket then cannot be bought. */
  tradable: boolean;
};

export type AttachedArgument = {
  thesisId: string;
  thesisVersionId: string;
  slug: string;
  role: "origin" | "argument";
  claim: string;
  summary: string;
  rationale: string;
  counterargument: string;
  changeMyMind: string;
  authorName: string;
  authorHandle: string | null;
  authorDisclosure: string;
  publishedAt: string | null;
  attachedAt: string;
};

export type BasketPerformance = {
  callId: string;
  /** Repeated so a caller cannot render a return beside an allocation it does not belong to. */
  basketVersionId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  benchmark: string;
  /** Oldest first, starting at the call's opening mark. May be a single point. */
  points: SeriesPoint[];
  observedAt: string | null;
};

export type BasketView = {
  basketId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  allocationAuthor: { name: string; handle: string | null; wallet: string | null };
  execution: {
    basketVersionId: string;
    versionNumber: number;
    allocationKey: string;
    /** The immutable thesis version a buy pins. Never an arbitrary attached argument. */
    executionThesisVersionId: string;
    executionSlug: string;
    weightRationale: string | null;
    holdings: BasketHolding[];
    buyable: boolean;
    blockedReason: string | null;
  };
  performance: BasketPerformance | null;
  /** Origin first, then newest attached. */
  arguments: AttachedArgument[];
};

/** Every live basket, assembled without a single per-row query. */
export async function listBaskets(): Promise<BasketView[]> {
  // Q1 — baskets and the allocation each one executes.
  const heads = await db
    .select({
      basketId: basket.id,
      slug: basket.slug,
      name: basket.name,
      description: basket.description,
      category: basket.category,
      authorName: basket.allocationAuthorName,
      authorHandle: basket.allocationAuthorHandle,
      authorWallet: basket.allocationAuthorWallet,
      createdAt: basket.createdAt,
      basketVersionId: basketVersion.id,
      versionNumber: basketVersion.versionNumber,
      allocationKey: basketVersion.allocationKey,
      weightRationale: basketVersion.weightRationale,
      callId: basketVersion.callId,
    })
    .from(basket)
    .innerJoin(basketVersion, eq(basketVersion.id, basket.executionVersionId))
    .where(eq(basket.status, "live"))
    .orderBy(desc(basket.createdAt));

  if (!heads.length) return [];

  const versionIds = heads.map((h) => h.basketVersionId);

  // Q2 — every attachment, with its argument's prose. Also identifies the origin, whose
  // per-holding reasoning decorates the allocation.
  const attachments = await db
    .select({
      basketVersionId: basketThesis.basketVersionId,
      role: basketThesis.role,
      attachedAt: basketThesis.attachedAt,
      thesisVersionId: thesisVersion.id,
      thesisId: thesis.id,
      slug: thesis.slug,
      claim: thesisVersion.claim,
      summary: thesisVersion.summary,
      rationale: thesisVersion.rationale,
      counterargument: thesisVersion.counterargument,
      changeMyMind: thesisVersion.changeMyMind,
      publishedAt: thesisVersion.publishedAt,
      authorName: thesis.authorName,
      authorHandle: thesis.authorHandle,
      authorDisclosure: thesis.authorDisclosure,
    })
    .from(basketThesis)
    .innerJoin(thesisVersion, eq(thesisVersion.id, basketThesis.thesisVersionId))
    .innerJoin(thesis, eq(thesis.id, thesisVersion.thesisId))
    .where(inArray(basketThesis.basketVersionId, versionIds));

  const originVersionId = new Map<string, string>();
  for (const a of attachments) if (a.role === "origin") originVersionId.set(a.basketVersionId, a.thesisVersionId);

  // Q3 — the allocation itself, joined to the origin's per-holding reasoning where there is one.
  const holdings = await db
    .select({
      basketVersionId: basketConstituent.basketVersionId,
      mint: basketConstituent.mint,
      position: basketConstituent.position,
      weightBps: basketConstituent.weightBps,
      symbol: asset.symbol,
      company: asset.company,
      enabled: asset.enabled,
      network: asset.network,
      assetId: asset.id,
    })
    .from(basketConstituent)
    .innerJoin(asset, eq(asset.id, basketConstituent.assetId))
    .where(inArray(basketConstituent.basketVersionId, versionIds));

  // Q4 — the origin's role/why/limitation, one query for every basket at once.
  const originIds = [...originVersionId.values()];
  const reasoning = originIds.length
    ? await db
        .select({
          versionId: thesisConstituent.versionId,
          assetId: thesisConstituent.assetId,
          role: thesisConstituent.exposureRole,
          why: thesisConstituent.why,
          limitation: thesisConstituent.limitation,
        })
        .from(thesisConstituent)
        .where(inArray(thesisConstituent.versionId, originIds))
    : [];
  const reasonBy = new Map<string, { role: string; why: string; limitation: string }>();
  for (const r of reasoning) reasonBy.set(`${r.versionId}:${r.assetId}`, r);

  // Q5 — the performance series for the chosen calls, plus one batched observation load.
  const callIds = heads.map((h) => h.callId).filter((c): c is string => Boolean(c));
  const calls = callIds.length
    ? await db
        .select({
          id: thesisCall.id,
          startsAt: thesisCall.startsAt,
          endsAt: thesisCall.endsAt,
          status: thesisCall.status,
          benchmark: thesisCall.benchmark,
          latestSnapshot: thesisCall.latestSnapshot,
        })
        .from(thesisCall)
        .where(inArray(thesisCall.id, callIds))
    : [];
  const callBy = new Map(calls.map((c) => [c.id, c]));
  const series = callIds.length ? await loadSeries(callIds) : new Map<string, SeriesPoint[]>();

  return heads.map((h) => {
    const origin = attachments.find((a) => a.basketVersionId === h.basketVersionId && a.role === "origin");
    const originId = origin?.thesisVersionId;

    const mine = holdings
      .filter((x) => x.basketVersionId === h.basketVersionId)
      .sort((a, b) => a.position - b.position)
      .map((x) => {
        const reason = originId ? reasonBy.get(`${originId}:${x.assetId}`) : undefined;
        return {
          mint: x.mint,
          symbol: x.symbol,
          company: x.company,
          position: x.position,
          weightBps: x.weightBps,
          role: reason?.role ?? null,
          why: reason?.why ?? null,
          limitation: reason?.limitation ?? null,
          tradable: x.enabled && x.network === "mainnet",
        };
      });

    const untradable = mine.filter((x) => !x.tradable);
    const call = h.callId ? callBy.get(h.callId) : undefined;
    const points = h.callId ? (series.get(h.callId) ?? []) : [];

    return {
      basketId: h.basketId,
      slug: h.slug,
      name: h.name,
      description: h.description,
      category: h.category,
      allocationAuthor: { name: h.authorName, handle: h.authorHandle, wallet: h.authorWallet },
      execution: {
        basketVersionId: h.basketVersionId,
        versionNumber: h.versionNumber,
        allocationKey: h.allocationKey,
        // The buy pins this exact immutable version, whatever else is attached.
        executionThesisVersionId: originId ?? "",
        executionSlug: origin?.slug ?? "",
        weightRationale: h.weightRationale,
        holdings: mine,
        buyable: mine.length >= 1 && mine.length <= 3 && untradable.length === 0 && Boolean(originId),
        blockedReason: untradable.length
          ? `${untradable.map((x) => x.symbol).join(", ")} ${untradable.length === 1 ? "is" : "are"} not currently tradable`
          : mine.length < 1 || mine.length > 3
            ? "this allocation is incomplete"
            : !originId
              ? "this basket has no published argument behind it"
              : null,
      },
      performance: call
        ? {
            callId: call.id,
            basketVersionId: h.basketVersionId,
            startsAt: call.startsAt.toISOString(),
            endsAt: call.endsAt.toISOString(),
            status: call.status,
            benchmark: call.benchmark,
            points,
            observedAt: call.latestSnapshot?.observedAt ?? null,
          }
        : null,
      arguments: attachments
        .filter((a) => a.basketVersionId === h.basketVersionId)
        .sort((a, b) =>
          a.role === "origin" ? -1 : b.role === "origin" ? 1 : b.attachedAt.getTime() - a.attachedAt.getTime(),
        )
        .map((a) => ({
          thesisId: a.thesisId,
          thesisVersionId: a.thesisVersionId,
          slug: a.slug,
          role: a.role as "origin" | "argument",
          claim: a.claim,
          summary: a.summary,
          rationale: a.rationale,
          counterargument: a.counterargument,
          changeMyMind: a.changeMyMind,
          authorName: a.authorName,
          authorHandle: a.authorHandle,
          authorDisclosure: a.authorDisclosure,
          publishedAt: a.publishedAt?.toISOString() ?? null,
          attachedAt: a.attachedAt.toISOString(),
        })),
    };
  });
}

/** One basket by slug, or null. Reuses the batched reader so there is one code path. */
export async function basketBySlug(slug: string): Promise<BasketView | null> {
  const all = await listBaskets();
  return all.find((b) => b.slug === slug) ?? null;
}
