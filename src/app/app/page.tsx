import type { Metadata } from "next";
import { Suspense } from "react";

import { Terminal } from "@/components/terminal/Terminal";
import type { BasketRow, TerminalBasket } from "@/components/terminal/types";
import { rankBaskets } from "@/lib/basket-ranking";
import { listBaskets } from "@/server/baskets/queries";
import { refreshCallsIfStale } from "@/server/calls/service";
import { after } from "next/server";
import { activityForTheses } from "@/server/conviction";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { thesisVersion } from "@/server/db/schema";
import { sourcePostFromEvidence, type SourcePost } from "@/lib/source-post";

import "./terminal.css";

export const metadata: Metadata = {
  title: "Terminal",
  description: "Pick a future, see how it is doing, read why people believe it, buy it.",
};

export const revalidate = 60;
// Room for a background refresh of the calls when they have gone stale (see refreshCallsIfStale).
export const maxDuration = 60;

/** The period the left column ranks on. Named, because "return" without one means nothing. */
const PERIOD = { label: "Since the call started", days: null as number | null };

export default async function TerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ basket?: string }>;
}) {
  // Keep the record current without waiting on a scheduler: stale calls refresh after this responds.
  after(() => refreshCallsIfStale());
  // Read on the server so the first paint already shows the right basket. Reading it in a client
  // effect instead meant a shared link rendered the top of the list, then swapped — which is a
  // flash on every deep link, and it made "reload keeps the selection" false for a moment.
  const initialSlug = (await searchParams).basket ?? null;
  const baskets = await listBaskets();

  // One query for every basket's activity, not one per row.
  const originThesisIds = baskets.map((b) => b.arguments.find((a) => a.role === "origin")?.thesisId).filter(Boolean) as string[];
  const activity = originThesisIds.length
    ? await activityForTheses(originThesisIds)
    : new Map<string, { buyers: number; volumeUsdc: number }>();

  const ranked = rankBaskets(
    baskets.map((b) => ({ slug: b.slug, points: b.performance?.points ?? [] })),
    PERIOD.days,
  );
  const rankBy = new Map(ranked.map((r) => [r.slug, r]));

  const rows: BasketRow[] = baskets
    .map((b) => {
      const r = rankBy.get(b.slug)!;
      return {
        slug: b.slug,
        name: b.name,
        description: b.description,
        holdings: b.execution.holdings.map((h) => ({
          mint: h.mint,
          symbol: h.symbol,
          company: h.company,
          weightBps: h.weightBps,
        })),
        returnPct: r.returnPct,
        rank: r.rank,
        unrankedReason: r.unrankedReason,
        argumentCount: b.arguments.length,
      };
    })
    // Ranked first, in order; unrankable last, alphabetically. Present, not hidden.
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.name.localeCompare(b.name);
    });

  // Who each argument came from: the credited post in its published evidence, one query for all.
  const versionIds = [...new Set(baskets.flatMap((b) => b.arguments.map((a) => a.thesisVersionId)))];
  const sources = new Map<string, SourcePost | null>();
  if (versionIds.length) {
    const rowsEv = await db.select({ id: thesisVersion.id, evidence: thesisVersion.evidence }).from(thesisVersion).where(inArray(thesisVersion.id, versionIds));
    for (const r of rowsEv) sources.set(r.id, sourcePostFromEvidence(r.evidence));
  }

  const terminal: TerminalBasket[] = baskets.map((b) => {
    const origin = b.arguments.find((a) => a.role === "origin");
    const act = origin ? activity.get(origin.thesisId) : undefined;
    return {
      basketId: b.basketId,
      slug: b.slug,
      name: b.name,
      description: b.description,
      category: b.category,
      allocationAuthor: { name: b.allocationAuthor.name, handle: b.allocationAuthor.handle },
      execution: {
        basketVersionId: b.execution.basketVersionId,
        executionThesisVersionId: b.execution.executionThesisVersionId,
        executionSlug: b.execution.executionSlug,
        weightRationale: b.execution.weightRationale,
        holdings: b.execution.holdings,
        buyable: b.execution.buyable,
        blockedReason: b.execution.blockedReason,
      },
      performance: b.performance
        ? {
            callId: b.performance.callId,
            startsAt: b.performance.startsAt,
            endsAt: b.performance.endsAt,
            status: b.performance.status,
            benchmark: b.performance.benchmark,
            points: b.performance.points,
            observedAt: b.performance.observedAt,
          }
        : null,
      arguments: b.arguments.map((a) => ({ ...a, source: sources.get(a.thesisVersionId) ?? null })),
      // Live purchases only. A count built from simulated runs would be the one number here
      // somebody could act on and be wrong about.
      activity: act ? { buyers: act.buyers, volumeUsdc: act.volumeUsdc } : null,
    };
  });

  return (
    <Suspense fallback={<div className="tm-loading">Loading the terminal…</div>}>
      <Terminal baskets={terminal} rows={rows} period={PERIOD.label} initialSlug={initialSlug} />
    </Suspense>
  );
}
