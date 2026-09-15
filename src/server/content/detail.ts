import { cache } from "react";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { asset, thesis, thesisConstituent, thesisUpdate, thesisVersion } from "../db/schema";
import type { EvidenceLink } from "./evidence";
import { sourcePostFromEvidence } from "@/lib/source-post";

/** Public, read-only detail. Render the published snapshot, never the editable seed. */
export const getPublishedThesis = cache(async (slug: string) => {
  const [row] = await db.select({
    slug: thesis.slug,
    category: thesis.category,
    authorName: thesis.authorName,
    authorDisclosure: thesis.authorDisclosure,
    versionId: thesisVersion.id,
    versionNumber: thesisVersion.versionNumber,
    claim: thesisVersion.claim,
    summary: thesisVersion.summary,
    rationale: thesisVersion.rationale,
    counterargument: thesisVersion.counterargument,
    changeMyMind: thesisVersion.changeMyMind,
    horizonLabel: thesisVersion.horizonLabel,
    reviewDate: thesisVersion.reviewDate,
    publishedAt: thesisVersion.publishedAt,
    evidence: thesisVersion.evidence,
  }).from(thesis)
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(and(eq(thesis.slug, slug), eq(thesis.status, "published"), isNotNull(thesisVersion.publishedAt)))
    .limit(1);
  if (!row) return null;

  const holdings = await db.select({
    symbol: asset.symbol,
    company: asset.company,
    underlying: asset.underlying,
    issuer: asset.issuer,
    issuerPowers: asset.issuerPowers,
    termsUrl: asset.termsUrl,
    role: thesisConstituent.exposureRole,
    why: thesisConstituent.why,
    limitation: thesisConstituent.limitation,
    weightBps: thesisConstituent.weightBps,
    weightRationale: thesisConstituent.weightRationale,
  }).from(thesisConstituent)
    .innerJoin(asset, eq(thesisConstituent.assetId, asset.id))
    .where(eq(thesisConstituent.versionId, row.versionId))
    .orderBy(asc(thesisConstituent.position));

  const evidence = (Array.isArray(row.evidence) ? row.evidence : []).filter((item): item is EvidenceLink => {
    if (!item || typeof item !== "object") return false;
    const e = item as Partial<EvidenceLink>;
    return typeof e.url === "string" && /^https?:\/\//.test(e.url)
      && typeof e.title === "string" && typeof e.source === "string" && typeof e.relevance === "string";
  });
  return { ...row, holdings, evidence, sourcePost: sourcePostFromEvidence(row.evidence) };
});

export type VersionRecord = {
  versionNumber: number;
  publishedAt: Date | null;
  /** Short hash, shown so a holder can tell two versions apart at a glance. */
  contentHash: string;
  isCurrent: boolean;
  evidenceCount: number;
};

export type UpdateRecord = {
  kind: string;
  title: string;
  body: string;
  authoredAt: Date;
  versionNumber: number | null;
};

/**
 * Every published version of a thesis, newest first.
 *
 * PRD §6: published versions cannot be silently overwritten, and material changes create a
 * new version. Showing the history is what makes that claim checkable rather than a
 * promise — a holder can see that the version they bought still exists.
 */
export const getVersionHistory = cache(async (slug: string): Promise<VersionRecord[]> => {
  const rows = await db
    .select({
      versionNumber: thesisVersion.versionNumber,
      publishedAt: thesisVersion.publishedAt,
      contentHash: thesisVersion.contentHash,
      currentVersionId: thesis.currentVersionId,
      versionId: thesisVersion.id,
      evidence: thesisVersion.evidence,
    })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesisVersion.thesisId, thesis.id))
    .where(and(eq(thesis.slug, slug), isNotNull(thesisVersion.publishedAt)))
    .orderBy(desc(thesisVersion.versionNumber));

  return rows.map((r) => ({
    versionNumber: r.versionNumber,
    publishedAt: r.publishedAt,
    contentHash: r.contentHash.slice(0, 10),
    isCurrent: r.versionId === r.currentVersionId,
    evidenceCount: Array.isArray(r.evidence) ? r.evidence.length : 0,
  }));
});

/**
 * Dated updates appended since publication. Deliberately separate from versions: an update
 * adds evidence to an existing argument, a version changes the argument itself.
 */
export const getUpdates = cache(async (slug: string): Promise<UpdateRecord[]> => {
  const rows = await db
    .select({
      kind: thesisUpdate.kind,
      title: thesisUpdate.title,
      body: thesisUpdate.body,
      authoredAt: thesisUpdate.authoredAt,
      versionNumber: thesisVersion.versionNumber,
    })
    .from(thesis)
    .innerJoin(thesisUpdate, eq(thesisUpdate.thesisId, thesis.id))
    .leftJoin(thesisVersion, eq(thesisUpdate.versionId, thesisVersion.id))
    .where(eq(thesis.slug, slug))
    .orderBy(desc(thesisUpdate.authoredAt));

  return rows.map((r) => ({ ...r, authoredAt: new Date(r.authoredAt) }));
});
