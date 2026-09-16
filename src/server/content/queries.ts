import { asc, desc, eq, and, isNotNull, inArray, or, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { asset, thesis, thesisConstituent, thesisVersion, thesisUpdate } from "../db/schema";
import type { EvidenceLink } from "./evidence";
import { loadSourceMetrics, withMetrics } from "./source-metrics";
import { sourcePostFromEvidence, type SourcePost } from "@/lib/source-post";

/**
 * Reads for the public catalogue. No wallet, no session — PRD TH-01: a visitor opens every
 * published thesis page without connecting anything.
 */

export type ThesisCardHolding = {
  /** Needed to decide whether a running call still describes this basket. */
  mint: string;
  symbol: string;
  company: string;
  role: string;
  why: string;
  limitation: string;
  weightBps: number;
};

export type ThesisCard = {
  versionId: string;
  /** Stable across versions, unlike versionId. A call is matched on this. */
  thesisId: string;
  /**
   * The post that prompted this thesis, read out of the published evidence snapshot.
   *
   * Deliberately not looked up from the seed files at render time: the seeds are mutable
   * and the snapshot is not, so attribution shown next to a basket is the attribution that
   * was published with it.
   */
  sourcePost: SourcePost | null;
  authorHandle: string | null;
  slug: string;
  title: string;
  claim: string;
  summary: string;
  rationale: string;
  counterargument: string;
  latestUpdate: { title: string; body: string; authoredAt: string } | null;
  category: string;
  authorName: string;
  horizonLabel: string;
  versionNumber: number;
  publishedAt: Date | null;
  /** Sources that argue for the claim. */
  supportingCount: number;
  /** Sources that argue against it. Shown separately — a thesis with none is hiding something. */
  againstCount: number;
  holdings: ThesisCardHolding[];
};

export async function listPublishedTheses(): Promise<ThesisCard[]> {
  const rows = await db
    .select({
      thesisId: thesis.id,
      slug: thesis.slug,
      title: thesis.title,
      category: thesis.category,
      authorName: thesis.authorName,
      authorHandle: thesis.authorHandle,
      versionId: thesisVersion.id,
      versionNumber: thesisVersion.versionNumber,
      claim: thesisVersion.claim,
      summary: thesisVersion.summary,
      rationale: thesisVersion.rationale,
      counterargument: thesisVersion.counterargument,
      horizonLabel: thesisVersion.horizonLabel,
      publishedAt: thesisVersion.publishedAt,
      evidence: thesisVersion.evidence,
    })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(and(eq(thesis.status, "published"), isNotNull(thesisVersion.publishedAt)))
    .orderBy(desc(thesisVersion.publishedAt));

  if (!rows.length) return [];

  // One query for every post on the page rather than one per card.
  const metrics = await loadSourceMetrics(rows.map((r) => sourcePostFromEvidence(r.evidence)));

  const updates = await db.select({ thesisId: thesisUpdate.thesisId, title: thesisUpdate.title, body: thesisUpdate.body, authoredAt: thesisUpdate.authoredAt })
    .from(thesisUpdate).leftJoin(thesisVersion, eq(thesisUpdate.versionId, thesisVersion.id))
    .where(and(inArray(thesisUpdate.thesisId, rows.map(r => r.thesisId)), or(isNull(thesisUpdate.versionId), isNotNull(thesisVersion.publishedAt))))
    .orderBy(desc(thesisUpdate.authoredAt));
  const cards: ThesisCard[] = [];
  for (const row of rows) {
    const holdings = await db
      .select({
        mint: asset.mint,
        symbol: asset.symbol,
        company: asset.company,
        role: thesisConstituent.exposureRole,
        why: thesisConstituent.why,
        limitation: thesisConstituent.limitation,
        weightBps: thesisConstituent.weightBps,
      })
      .from(thesisConstituent)
      .innerJoin(asset, eq(thesisConstituent.assetId, asset.id))
      .where(eq(thesisConstituent.versionId, row.versionId))
      .orderBy(asc(thesisConstituent.position));

    const evidence = (Array.isArray(row.evidence) ? row.evidence : []) as EvidenceLink[];

    const latestUpdate = updates.find(u => u.thesisId === row.thesisId);
    cards.push({
      versionId: row.versionId,
      thesisId: row.thesisId,
      sourcePost: withMetrics(sourcePostFromEvidence(row.evidence), metrics),
      authorHandle: row.authorHandle,
      slug: row.slug,
      title: row.title,
      claim: row.claim,
      summary: row.summary,
      rationale: row.rationale,
      counterargument: row.counterargument,
      latestUpdate: latestUpdate ? { title: latestUpdate.title, body: latestUpdate.body, authoredAt: latestUpdate.authoredAt.toISOString() } : null,
      category: row.category,
      authorName: row.authorName,
      horizonLabel: row.horizonLabel,
      versionNumber: row.versionNumber,
      publishedAt: row.publishedAt,
      supportingCount: evidence.filter((e) => !e.supportsCounterargument && !("sourcePost" in e)).length,
      againstCount: evidence.filter((e) => e.supportsCounterargument).length,
      holdings,
    });
  }
  return cards;
}
