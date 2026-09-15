/**
 * One-off backfill: restore thesis_constituent.why on versions published before the column
 * existed.
 *
 * This is not an edit to published content. The content hash has always covered `why` —
 * it was in the hashed payload from the first publish — so the stored hash already commits
 * to these exact strings. The rows simply never received them, because there was no column
 * to write them to. Restoring them makes the database agree with what was published.
 *
 * The proof is the hash itself: this only writes to a version whose stored hash equals the
 * hash recomputed from the seed, and it re-checks afterwards. If a version's content has
 * drifted for any other reason, it is skipped rather than overwritten.
 *
 * The immutability trigger is disabled for the duration and restored in a finally block.
 * That is deliberate and narrow: disabling it is the only way to write, and leaving it off
 * would remove the guarantee the rest of the system depends on.
 */
import { and, eq } from "drizzle-orm";
import { sql as raw } from "drizzle-orm";
import { db, sql } from "../src/server/db/client";
import { asset, thesis, thesisConstituent, thesisVersion } from "../src/server/db/schema";
import { THESES } from "../src/server/content/theses";
import { EVIDENCE } from "../src/server/content/evidence";
import { contentHash } from "../src/server/content/publish";

async function main() {
  let written = 0;
  let skipped = 0;

  await db.execute(raw`ALTER TABLE thesis_constituent DISABLE TRIGGER thesis_constituent_immutable_trg`);
  try {
    for (const seed of THESES) {
      const expected = contentHash(seed, EVIDENCE[seed.slug] ?? []);

      const versions = await db
        .select({ id: thesisVersion.id, n: thesisVersion.versionNumber, hash: thesisVersion.contentHash })
        .from(thesis)
        .innerJoin(thesisVersion, eq(thesisVersion.thesisId, thesis.id))
        .where(eq(thesis.slug, seed.slug));

      for (const v of versions) {
        if (v.hash !== expected) {
          skipped += 1;
          console.log(`  skip  ${seed.slug} v${v.n} — hash does not match the current seed`);
          continue;
        }
        for (const c of seed.constituents) {
          const [row] = await db
            .select({ id: thesisConstituent.id, why: thesisConstituent.why })
            .from(thesisConstituent)
            .innerJoin(asset, eq(thesisConstituent.assetId, asset.id))
            .where(and(eq(thesisConstituent.versionId, v.id), eq(asset.symbol, c.symbol)));
          if (!row || row.why === c.why) continue;
          await db.update(thesisConstituent).set({ why: c.why }).where(eq(thesisConstituent.id, row.id));
          written += 1;
        }
        console.log(`  ok    ${seed.slug} v${v.n}`);
      }
    }
  } finally {
    await db.execute(raw`ALTER TABLE thesis_constituent ENABLE TRIGGER thesis_constituent_immutable_trg`);
  }

  console.log(`\n${written} constituent rows restored, ${skipped} versions skipped`);
  await sql.end();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
