import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { asset, thesis, thesisConstituent, thesisVersion } from "../db/schema";
import type { EvidenceLink } from "./evidence";
import { sourcePostFromEvidence, type SourcePost } from "@/lib/source-post";

/**
 * Reads for the public catalogue. No wallet, no session — PRD TH-01: a visitor opens every
 * published thesis page without connecting anything.
 */

export type ThesisCardHolding = {
  symbol: string;
  company: string;
  role: string;
  weightBps: number;
};

export type ThesisCard = {
  versionId: string;
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
      slug: thesis.slug,
      title: thesis.title,
      category: thesis.category,
      authorName: thesis.authorName,
      authorHandle: thesis.authorHandle,
      versionId: thesisVersion.id,
      versionNumber: thesisVersion.versionNumber,
      claim: thesisVersion.claim,
      summary: thesisVersion.summary,
      horizonLabel: thesisVersion.horizonLabel,
      publishedAt: thesisVersion.publishedAt,
      evidence: thesisVersion.evidence,
    })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(eq(thesis.status, "published"))
    .orderBy(desc(thesisVersion.publishedAt));

  if (!rows.length) return [];

  const cards: ThesisCard[] = [];
  for (const row of rows) {
    const holdings = await db
      .select({
        symbol: asset.symbol,
        company: asset.company,
        role: thesisConstituent.exposureRole,
        weightBps: thesisConstituent.weightBps,
      })
      .from(thesisConstituent)
      .innerJoin(asset, eq(thesisConstituent.assetId, asset.id))
      .where(eq(thesisConstituent.versionId, row.versionId))
      .orderBy(asc(thesisConstituent.position));

    const evidence = (Array.isArray(row.evidence) ? row.evidence : []) as EvidenceLink[];

    cards.push({
      versionId: row.versionId,
      sourcePost: sourcePostFromEvidence(row.evidence),
      authorHandle: row.authorHandle,
      slug: row.slug,
      title: row.title,
      claim: row.claim,
      summary: row.summary,
      category: row.category,
      authorName: row.authorName,
      horizonLabel: row.horizonLabel,
      versionNumber: row.versionNumber,
      publishedAt: row.publishedAt,
      supportingCount: evidence.filter((e) => !e.supportsCounterargument).length,
      againstCount: evidence.filter((e) => e.supportsCounterargument).length,
      holdings,
    });
  }
  return cards;
}
