/**
 * Fill a local database with enough theses to feel the feed at scale.
 *
 * Run with: pnpm tsx scripts/seed-dev-feed.ts [count]
 *
 * These are fixtures, not content. Every one is authored by "Thesis fixtures", carries a
 * FIXTURE marker in its slug, and says in its own summary that it is placeholder text. The
 * catalogue's real promise is that a thesis is researched, sourced, and argued against, and
 * fifty machine-assembled baskets cannot honour that — so rather than pretending, they
 * announce themselves.
 *
 * What is deliberately absent: no invented X posts, no invented authors, no invented
 * engagement, no invented calls. The four editorial theses keep their real source, their
 * real metrics and their real running calls. Fixtures have no call at all, which also makes
 * them useful — they exercise the "no call yet" state the real catalogue never shows.
 *
 * It refuses to run against anything but a local database. A fixture that reached beta
 * would be indistinguishable from the real catalogue to anyone reading it.
 */

import { randomUUID } from "node:crypto";

import { and, eq, like } from "drizzle-orm";

import { EQUITY_ASSETS } from "../src/server/assets/allowlist";
import { db } from "../src/server/db/client";
import { asset, thesis, thesisConstituent, thesisVersion } from "../src/server/db/schema";

const MARKER = "fixture-";
const AUTHOR = "Thesis fixtures";

/** Belief shapes, paired with the kind of business that would express them. */
const SHAPES = [
  ["Compute keeps getting scarcer", "the companies that sell it, rent it, and build on it"],
  ["Software margins compress", "the vendors that own distribution rather than the model"],
  ["Payments keep leaving the card networks", "the rails that settle without them"],
  ["Advertising follows measurement", "whoever owns the surface where the result is visible"],
  ["Enterprises buy certainty, not capability", "the vendors large enough to indemnify"],
  ["Retail brokerage consolidates", "the venues where the flow already is"],
  ["Search becomes an answer, not a list", "the firms holding the index and the model"],
  ["Logistics is a data business", "the operators with the densest network"],
  ["Cloud spend shifts to inference", "the layers that charge per call"],
  ["Regulation favours incumbents", "the balance sheets that can absorb it"],
];

const CATEGORIES = ["Technology", "Finance", "Consumer", "Industrials"];

function slugFor(index: number, shape: string): string {
  return `${MARKER}${index}-${shape.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 80);
}

async function main() {
  const count = Number(process.argv[2] ?? 50);
  const url = process.env.DATABASE_URL ?? "";

  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("  refusing to run: DATABASE_URL is not a local database.");
    console.error("  These are placeholder theses. On a shared database they would be");
    console.error("  indistinguishable from the researched catalogue.");
    process.exit(1);
  }

  if (process.argv.includes("--clean")) {
    const rows = await db.select({ id: thesis.id }).from(thesis).where(like(thesis.slug, `${MARKER}%`));
    for (const r of rows) {
      await db.delete(thesisConstituent).where(
        eq(thesisConstituent.versionId, (await db.select({ id: thesisVersion.id }).from(thesisVersion).where(eq(thesisVersion.thesisId, r.id)))[0]?.id ?? ""),
      ).catch(() => {});
      await db.update(thesis).set({ currentVersionId: null }).where(eq(thesis.id, r.id));
      await db.delete(thesisVersion).where(eq(thesisVersion.thesisId, r.id));
      await db.delete(thesis).where(eq(thesis.id, r.id));
    }
    console.log(`  removed ${rows.length} fixture theses`);
    return;
  }

  const assets = await db.select({ id: asset.id, symbol: asset.symbol }).from(asset);
  const bySymbol = new Map(assets.map((a) => [a.symbol, a.id]));
  // Only assets that are both on the verified allowlist and present in this database.
  const usable = EQUITY_ASSETS.filter((a) => a.enabled && bySymbol.has(a.symbol));
  if (usable.length < 3) {
    console.error("  not enough seeded assets to build a basket; run pnpm db:seed first.");
    process.exit(1);
  }

  let made = 0;
  for (let i = 0; i < count; i += 1) {
    const [claim, expresses] = SHAPES[i % SHAPES.length];
    const slug = slugFor(i, claim);
    const existing = await db.select({ id: thesis.id }).from(thesis).where(eq(thesis.slug, slug));
    if (existing.length) continue;

    // Rotate the basket so the feed shows a variety of logos rather than the same three.
    const picks = [0, 1, 2].map((n) => usable[(i * 3 + n) % usable.length]);
    const weights = [3400, 3300, 3300];

    const thesisId = randomUUID();
    const versionId = randomUUID();

    await db.insert(thesis).values({
      id: thesisId,
      slug,
      title: claim,
      category: CATEGORIES[i % CATEGORIES.length],
      authorName: AUTHOR,
      authorHandle: null,
      // Required, and the honest value for a fixture: it says on the record what it is.
      authorDisclosure: "Placeholder fixture for development. Not researched and not an investment view.",
      status: "published",
      currentVersionId: null,
    });

    await db.insert(thesisVersion).values({
      id: versionId,
      thesisId,
      versionNumber: 1,
      claim,
      summary: `Placeholder fixture for layout work. A real thesis names ${expresses} and argues the case; this one exists only so the feed can be seen at scale.`,
      rationale:
        "Fixture text. Not researched, not sourced, and not an investment view. It is here so that scrolling, search, ranking and empty states can be exercised against a realistic number of rows.",
      counterargument: "Fixture text. A published thesis carries the strongest argument against itself here.",
      changeMyMind: "Fixture text.",
      horizonLabel: "Review in 12 months",
      reviewDate: null,
      evidence: [],
      contentHash: `fixture-${thesisId}`,
      // Backdated so fixtures never outrank the researched catalogue in a feed ordered
      // by publication date. They are scaffolding; they should sit underneath.
      publishedAt: new Date(Date.now() - (i + 30) * 86_400_000),
    });

    await db.insert(thesisConstituent).values(
      picks.map((p, n) => ({
        id: randomUUID(),
        versionId,
        assetId: bySymbol.get(p.symbol)!,
        position: n,
        weightBps: weights[n],
        exposureRole: "Fixture role",
        why: "Fixture text.",
        limitation: "Fixture text.",
        weightRationale: null,
      })),
    );

    await db.update(thesis).set({ currentVersionId: versionId }).where(eq(thesis.id, thesisId));
    made += 1;
  }

  const total = await db.select({ id: thesis.id }).from(thesis).where(and(eq(thesis.status, "published")));
  console.log(`  added ${made} fixture theses · ${total.length} published rows total`);
  console.log("  remove them with: pnpm tsx scripts/seed-dev-feed.ts --clean");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
