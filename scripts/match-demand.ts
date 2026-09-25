import { desc, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { matchQuery } from "@/server/db/schema";

/**
 * What people are looking for, and what the catalogue does not have.
 *
 * The homepage records every search and its outcome. This reads that back the only way it is
 * actually useful: **the searches that matched nothing come first**, because each one is a demand
 * signal with the supply gap already named. A run of them on one subject is the strongest argument
 * there is for reviewing a basket about it.
 *
 * It also shows which baskets are being found, which answers the opposite question — what the
 * catalogue is already carrying its weight on.
 *
 *   pnpm tsx scripts/match-demand.ts [days]
 */

const days = Number(process.argv[2] ?? 30);
const since = sql`now() - ${`${days} days`}::interval`;

async function main() {
  const rows = await db
    .select({
      input: matchQuery.input,
      outcome: matchQuery.outcome,
      noMatch: matchQuery.noMatch,
      topSlug: matchQuery.topSlug,
      topStrength: matchQuery.topStrength,
      topScore: matchQuery.topScore,
      createdAt: matchQuery.createdAt,
    })
    .from(matchQuery)
    .where(sql`${matchQuery.createdAt} >= ${since}`)
    .orderBy(desc(matchQuery.createdAt));

  if (!rows.length) {
    console.log(`No searches in the last ${days} days.`);
    return;
  }

  const ok = rows.filter((r) => r.outcome === "ok");
  const gaps = ok.filter((r) => r.noMatch);
  const found = ok.filter((r) => !r.noMatch);

  console.log(`\n${rows.length} searches in ${days} days`);
  console.log(`  ${found.length} found a basket · ${gaps.length} found nothing · ${rows.length - ok.length} did not complete\n`);

  console.log("─".repeat(78));
  console.log("NOTHING MATCHED — the catalogue's to-do list, newest first");
  console.log("─".repeat(78));
  if (!gaps.length) console.log("  (none)");
  for (const r of gaps.slice(0, 40)) {
    const near = r.topSlug ? `closest ${r.topSlug} ${r.topScore ?? ""}` : "nothing close";
    console.log(`  ${r.createdAt.toISOString().slice(0, 10)}  ${one(r.input).slice(0, 88)}`);
    console.log(`              ${near}`);
  }

  console.log(`\n${"─".repeat(78)}`);
  console.log("WHAT IS BEING FOUND — baskets earning their place");
  console.log("─".repeat(78));
  const bySlug = new Map<string, { n: number; strong: number }>();
  for (const r of found) {
    if (!r.topSlug) continue;
    const row = bySlug.get(r.topSlug) ?? { n: 0, strong: 0 };
    row.n += 1;
    if (r.topStrength === "strong") row.strong += 1;
    bySlug.set(r.topSlug, row);
  }
  const ranked = [...bySlug.entries()].sort((a, b) => b[1].n - a[1].n);
  if (!ranked.length) console.log("  (none)");
  for (const [slug, v] of ranked) {
    console.log(`  ${String(v.n).padStart(4)}  ${slug.padEnd(30)} ${v.strong} strong`);
  }

  /* A basket nobody's search ever reaches is not necessarily a bad basket — but it is a question
     worth asking, and the answer is never visible from inside the catalogue. */
  console.log(`\n${"─".repeat(78)}`);
  console.log("NEVER THE BEST MATCH in this window");
  console.log("─".repeat(78));
  const live = await db.execute<{ slug: string }>(sql`SELECT slug FROM basket WHERE status = 'live'`);
  const never = live.filter((b) => !bySlug.has(b.slug)).map((b) => b.slug);
  console.log(never.length ? never.map((s) => `  ${s}`).join("\n") : "  (every basket was the best match at least once)");
  console.log();
}

const one = (s: string) => s.replace(/\s+/g, " ").trim();

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
