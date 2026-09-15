import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { asset, thesis, thesisConstituent, thesisVersion } from "../db/schema";
import { THESES, AUTHOR, type ThesisSeed } from "./theses";
import { EVIDENCE, MIN_EVIDENCE_LINKS, type EvidenceLink } from "./evidence";
import { CURATED_THESES, CURATED_EVIDENCE, type CuratedEvidence } from "./curated";
import { validateAllocation } from "@/lib/money/allocate";

/**
 * Publish the catalogue.
 *
 * A published version is immutable — the database enforces that with a trigger — so this
 * validates hard before writing rather than fixing things afterwards. Re-running it
 * creates a NEW version when content changed and does nothing when it did not, which is
 * what the content hash is for.
 */

export class ContentError extends Error {}

/**
 * Editorial theses and curated ones are published by the same pipeline and validated by the
 * same gates. They are kept in separate files so that adding a curated entry never edits
 * evidence.ts or theses.ts, which hold sources already verified.
 */
export const ALL_SEEDS: ThesisSeed[] = [...THESES, ...CURATED_THESES];

export function evidenceFor(slug: string): CuratedEvidence[] {
  return CURATED_EVIDENCE[slug] ?? EVIDENCE[slug] ?? [];
}

/** Canonical JSON over the fields a reader would call "the thesis". Order is fixed. */
export function contentHash(seed: ThesisSeed, evidence: EvidenceLink[]): string {
  const canonical = JSON.stringify({
    claim: seed.claim,
    summary: seed.summary,
    rationale: seed.rationale,
    counterargument: seed.counterargument,
    changeMyMind: seed.changeMyMind,
    horizonLabel: seed.horizonLabel,
    reviewDate: seed.reviewDate,
    weightRationale: seed.weightRationale,
    constituents: seed.constituents
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ symbol: c.symbol, position: c.position, weightBps: c.weightBps, role: c.role, why: c.why, limitation: c.limitation })),
    evidence: evidence.map((e) => {
      const post = (e as CuratedEvidence).sourcePost;
      return {
        url: e.url,
        title: e.title,
        source: e.source,
        publishedAt: e.publishedAt,
        relevance: e.relevance,
        // Present only for curated entries. Adding an absent key would change every
        // existing hash and orphan the versions already published against them.
        ...(post
          ? {
              sourcePost: {
                url: post.url,
                author: post.author,
                handle: post.handle,
                text: post.text,
                postedAt: post.postedAt,
                verifiedAt: post.verifiedAt,
              },
            }
          : {}),
      };
    }),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function validateSeed(seed: ThesisSeed, evidence: EvidenceLink[], allowUnsourced: boolean): void {
  validateAllocation(
    seed.constituents.map((c) => ({ assetId: c.symbol, positionIndex: c.position, bps: c.weightBps })),
  );

  const unequal = new Set(seed.constituents.map((c) => c.weightBps)).size > 1;
  const equalDefault = seed.constituents.every((c) => c.weightBps === 3400 || c.weightBps === 3300);
  if (unequal && !equalDefault && !seed.weightRationale) {
    throw new ContentError(`${seed.slug}: unequal weights need a stated reason (PRD §6)`);
  }

  for (const c of seed.constituents) {
    if (!c.role.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a role`);
    if (!c.why.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a stated case`);
    if (!c.limitation.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a limitation`);
  }
  if (!seed.counterargument.trim()) throw new ContentError(`${seed.slug}: needs a counterargument`);
  if (!seed.changeMyMind.trim()) throw new ContentError(`${seed.slug}: needs a change-my-mind condition`);

  if (evidence.length < MIN_EVIDENCE_LINKS && !allowUnsourced) {
    throw new ContentError(
      `${seed.slug}: has ${evidence.length} evidence links, needs ${MIN_EVIDENCE_LINKS}. ` +
        `Set ALLOW_UNSOURCED_SEED=1 to publish anyway for local development only.`,
    );
  }
}

export async function publishAll(options: { allowUnsourced?: boolean } = {}) {
  const allowUnsourced = options.allowUnsourced ?? false;
  const results: { slug: string; action: "created" | "new_version" | "unchanged"; version: number }[] = [];

  for (const seed of ALL_SEEDS) {
    const evidence = evidenceFor(seed.slug);
    validateSeed(seed, evidence, allowUnsourced);

    // Resolve every constituent against the verified asset table. A symbol that is not
    // there, or is not enabled, cannot be published — TH-05 at the content boundary.
    const assetIds = new Map<string, string>();
    for (const c of seed.constituents) {
      const rows = await db
        .select({ id: asset.id, enabled: asset.enabled })
        .from(asset)
        .where(and(eq(asset.symbol, c.symbol), eq(asset.network, "mainnet")));
      if (!rows.length) throw new ContentError(`${seed.slug}: ${c.symbol} is not in the asset table`);
      if (!rows[0].enabled) throw new ContentError(`${seed.slug}: ${c.symbol} is not enabled for trading`);
      assetIds.set(c.symbol, rows[0].id);
    }

    const hash = contentHash(seed, evidence);

    const existingThesis = await db.select().from(thesis).where(eq(thesis.slug, seed.slug));
    let thesisId: string;
    let action: "created" | "new_version" | "unchanged" = "created";

    if (existingThesis.length) {
      thesisId = existingThesis[0].id;
      // Title, category and author disclosure live on the thesis, not the version, so
      // they are not covered by the content hash and have to be refreshed on every run.
      await db
        .update(thesis)
        .set({
          title: seed.title,
          category: seed.category,
          authorName: AUTHOR.name,
          authorHandle: AUTHOR.handle,
          authorDisclosure: AUTHOR.disclosure,
          updatedAt: new Date(),
        })
        .where(eq(thesis.id, thesisId));
      const same = await db.select({ id: thesisVersion.id, n: thesisVersion.versionNumber })
        .from(thesisVersion)
        .where(and(eq(thesisVersion.thesisId, thesisId), eq(thesisVersion.contentHash, hash)));
      if (same.length) {
        results.push({ slug: seed.slug, action: "unchanged", version: same[0].n });
        continue;
      }
      action = "new_version";
    } else {
      const [row] = await db
        .insert(thesis)
        .values({
          slug: seed.slug,
          title: seed.title,
          authorName: AUTHOR.name,
          authorHandle: AUTHOR.handle,
          authorDisclosure: AUTHOR.disclosure,
          category: seed.category,
          status: "published",
        })
        .returning({ id: thesis.id });
      thesisId = row.id;
    }

    const prior = await db.select({ n: thesisVersion.versionNumber }).from(thesisVersion).where(eq(thesisVersion.thesisId, thesisId));
    const versionNumber = prior.reduce((max, r) => Math.max(max, r.n), 0) + 1;

    const [version] = await db
      .insert(thesisVersion)
      .values({
        thesisId,
        versionNumber,
        claim: seed.claim,
        summary: seed.summary,
        rationale: seed.rationale,
        counterargument: seed.counterargument,
        changeMyMind: seed.changeMyMind,
        horizonLabel: seed.horizonLabel,
        reviewDate: seed.reviewDate,
        evidence,
        contentHash: hash,
        publishedAt: new Date(),
      })
      .returning({ id: thesisVersion.id });

    // Constituents are written before the version is pointed at, because the immutability
    // trigger refuses to touch them once the version they belong to is published... and it
    // is already published. So they go in within the same statement batch, and the trigger
    // is what stops a later edit.
    for (const c of seed.constituents) {
      await db.insert(thesisConstituent).values({
        versionId: version.id,
        assetId: assetIds.get(c.symbol)!,
        position: c.position,
        weightBps: c.weightBps,
        exposureRole: c.role,
        why: c.why,
        limitation: c.limitation,
        weightRationale: c.position === 0 ? seed.weightRationale : null,
      });
    }

    await db.update(thesis).set({ currentVersionId: version.id, status: "published", updatedAt: new Date() }).where(eq(thesis.id, thesisId));

    results.push({ slug: seed.slug, action, version: versionNumber });
  }

  return results;
}
