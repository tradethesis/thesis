/**
 * Give every published thesis the basket it has always implicitly had.
 *
 *   pnpm tsx scripts/backfill-baskets.ts            # dry run, prints the plan
 *   pnpm tsx scripts/backfill-baskets.ts --apply    # one transaction, verified before commit
 *
 * Until now a thesis *was* its basket: the allocation lived on `thesis_constituent` and there
 * was no row anybody could point at. That is why two arguments over an identical allocation had
 * no available answer except refusing the second one. This walks the published catalogue, groups
 * it by exact allocation, and writes the parent rows.
 *
 * Three things it refuses to do:
 *
 *   1. **Guess a name.** Every basket's name and description come from BASKET_NAMES below. A
 *      missing slug aborts the run with the slug printed. A derived name like "MSFTx GOOGLx
 *      AMZNx" says nothing, and a generated one is unreviewable at the moment it matters.
 *   2. **Touch a fixture.** The 50 development rows never cleared a single publish gate — they
 *      are written by direct insert in seed-dev-feed.ts — and they all share the weights
 *      [3400,3300,3300] over a rotating pick, so some collide with each other. Letting one claim
 *      an allocation identity would mean a future real thesis being told to attach to
 *      `fixture-17`. They get no basket, and "thesis with no basket" is a supported, unbuyable
 *      state.
 *   3. **Match a performance series on identity.** A call is chosen only when its frozen
 *      holdings hash to this exact allocation. Matching on thesis identity instead would attach
 *      a genuine, correct, immutable ninety-day series to the wrong basket, and nothing
 *      downstream would notice.
 *
 * ## Only current versions become arguments
 *
 * The first draft of this script walked every published version, and the dry run found why that
 * is wrong: `spending-a-trillion-is-the-easy-part` v1 held the identical allocation to
 * `ai-liability-favors-big-cloud`, then its author re-weighted it in v2. Attaching that v1 as a
 * live argument would tell readers somebody believes a thing they demonstrably stopped
 * believing — and it would collide on the global allocation index besides.
 *
 * A superseded version is the *thesis's* history, not an argument for a basket. So each thesis
 * contributes exactly its current published version. `basket_execution_span` still exists and
 * still records re-weights, but it records the ones a basket's allocation author makes from
 * here on, which is a different event from an author moving their thesis to a new allocation.
 */

import { sql } from "drizzle-orm";

import { allocationKey } from "../src/lib/basket";
import { BASKET_NAMES } from "../src/server/content/baskets";
import { db } from "../src/server/db/client";


const EXPECTED = Number(flag("expect") ?? 10);
const APPLY = process.argv.includes("--apply");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type Row = {
  thesis_id: string;
  slug: string;
  category: string;
  author_name: string;
  author_handle: string | null;
  creator_wallet: string | null;
  version_id: string;
  version_number: number;
  published_at: Date;
  weight_rationale: string | null;
  allocation_key: string;
  holdings: { assetId: string; mint: string; position: number; weightBps: number }[];
};

async function main() {
  /*
   * Each thesis's current published version, ordered oldest first so the earliest author of a
   * shared allocation becomes its origin.
   *
   * Three independent fixture predicates rather than one, because any single string is one typo
   * away from admitting fifty placeholder baskets. The --expect assertion below is the real
   * guard; these are how it is met.
   */
  const rows = (await db.execute<Row>(sql`
    SELECT th.id AS thesis_id, th.slug, th.category, th.author_name, th.author_handle,
           th.creator_wallet, tv.id AS version_id, tv.version_number, tv.published_at,
           max(tc.weight_rationale) AS weight_rationale,
           string_agg(a.mint || ':' || tc.weight_bps, '|' ORDER BY a.mint COLLATE "C") AS allocation_key,
           jsonb_agg(jsonb_build_object('assetId', a.id, 'mint', a.mint,
                                        'position', tc.position, 'weightBps', tc.weight_bps)
                     ORDER BY tc.position) AS holdings
      FROM thesis th
      JOIN thesis_version tv ON tv.thesis_id = th.id AND tv.published_at IS NOT NULL
      JOIN thesis_constituent tc ON tc.version_id = tv.id
      JOIN asset a ON a.id = tc.asset_id
     WHERE th.status = 'published'
       AND tv.id = th.current_version_id
       AND th.slug NOT LIKE 'fixture-%'
       AND th.author_name <> 'Thesis fixtures'
       AND tv.content_hash NOT LIKE 'fixture-%'
       -- Already attached versions are skipped. A thesis that publishSeed created a basket for, or
       -- that an earlier run of this script handled, must not get a second one — the allocation
       -- identity is globally unique and the insert would collide.
       AND NOT EXISTS (SELECT 1 FROM basket_thesis bt WHERE bt.thesis_version_id = tv.id)
     GROUP BY th.id, tv.id
     ORDER BY tv.published_at ASC, th.slug ASC
  `)) as unknown as Row[];

  const theses = new Set(rows.map((r) => r.slug));
  console.log(`${rows.length} published versions across ${theses.size} theses`);

  if (!rows.length) {
    console.log("every published thesis already has a basket. Nothing to do.");
    process.exit(0);
  }
  if (theses.size > EXPECTED) {
    throw new Error(
      `${theses.size} theses need a basket, more than the ${EXPECTED} expected. Re-run with ` +
        `--expect ${theses.size} only after checking that no development fixture slipped through.`,
    );
  }

  const missing = [...theses].filter((s) => !BASKET_NAMES[s]);
  if (missing.length) {
    throw new Error(`no name written for:\n  ${missing.join("\n  ")}\nAdd them to BASKET_NAMES and re-run.`);
  }

  /*
   * Group by allocation, globally.
   *
   * An allocation identity exists once. Two theses naming the same mints at the same weights are
   * arguing about one basket, so they become one row with two arguments attached — which is the
   * whole point of the parent, and the case that used to be refused outright.
   */
  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    // Cross-check the SQL-derived key against the TypeScript one. They sort in different
    // languages and must agree byte for byte; a silent disagreement is exactly the bug that
    // empties the conviction standings.
    const derived = allocationKey(r.holdings);
    if (derived !== r.allocation_key) {
      throw new Error(`key mismatch on ${r.slug} v${r.version_number}\n  sql: ${r.allocation_key}\n  ts : ${derived}`);
    }
    const list = byKey.get(r.allocation_key) ?? [];
    list.push(r);
    byKey.set(r.allocation_key, list);
  }

  type Plan = {
    key: string;
    name: string;
    description: string;
    category: string;
    basketSlug: string;
    author: { name: string; handle: string | null; wallet: string | null };
    /** Oldest first. The first is the origin: its prose decorates the holdings. */
    rows: Row[];
  };

  const usedSlugs = new Set<string>();
  const plans: Plan[] = [];

  for (const [key, group] of byKey) {
    // The earliest published thesis over this allocation names the basket and is credited with
    // building it. A later author attaching an argument does not rename somebody else's basket.
    const origin = group[0];
    const meta = BASKET_NAMES[origin.slug];

    let basketSlug = slugify(meta.name);
    for (let n = 2; usedSlugs.has(basketSlug); n += 1) basketSlug = `${slugify(meta.name)}-${n}`;
    usedSlugs.add(basketSlug);

    plans.push({
      key,
      name: meta.name,
      description: meta.description,
      category: origin.category,
      basketSlug,
      author: { name: origin.author_name, handle: origin.author_handle, wallet: origin.creator_wallet },
      rows: group,
    });
  }

  console.log("");
  for (const p of plans) {
    const holdings = p.rows[0].holdings
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((h) => `${h.weightBps / 100}%`)
      .join(" / ");
    const attached = p.rows.length > 1 ? `  ${p.rows.length} theses` : "";
    console.log(`  ${p.name.padEnd(24)} ${holdings.padEnd(18)} ← ${p.rows.map((r) => r.slug).join(", ")}${attached}`);
  }

  if (!APPLY) {
    console.log(`\n${plans.length} baskets planned. Nothing written. Re-run with --apply.`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const p of plans) {
      const [b] = (await tx.execute<{ id: string }>(sql`
        INSERT INTO basket (slug, name, description, category, chain,
                            allocation_author_name, allocation_author_handle, allocation_author_wallet,
                            status)
        VALUES (${p.basketSlug}, ${p.name}, ${p.description}, ${p.category}, 'solana',
                ${p.author.name}, ${p.author.handle}, ${p.author.wallet}, 'draft')
        RETURNING id
      `)) as unknown as { id: string }[];

      // The series is chosen only when its frozen holdings hash to this exact allocation.
      // Matching on thesis identity instead would attach a genuine, immutable ninety-day series
      // to a basket it never measured.
      const candidates = (await tx.execute<{ id: string }>(sql`
        SELECT tc.id
          FROM thesis_call tc
         WHERE tc.version_id IN (${sql.join(p.rows.map((r) => sql`${r.version_id}`), sql`, `)})
           AND coalesce((SELECT string_agg((h->>'mint') || ':' || (h->>'weightBps'), '|'
                                           ORDER BY (h->>'mint') COLLATE "C")
                           FROM jsonb_array_elements(tc.holdings) h), '') = ${p.key}
         ORDER BY tc.starts_at ASC
      `)) as unknown as { id: string }[];

      const callId = candidates.length ? candidates[0].id : null;
      const reason = !candidates.length
        ? null
        : candidates.length === 1
          ? "only_candidate"
          : `oldest_of_${candidates.length}`;
      if (candidates.length > 1) {
        console.log(`  ${p.name}: ${candidates.length} calls measure this allocation, taking the oldest`);
      }
      if (!candidates.length) {
        console.log(`  ${p.name}: no call measures this allocation — it will show as untracked`);
      }

      const [bv] = (await tx.execute<{ id: string }>(sql`
        INSERT INTO basket_version (basket_id, version_number, chain, allocation_key,
                                    weight_rationale, call_id, call_selection_reason, state)
        VALUES (${b.id}, 1, 'solana', ${p.key},
                ${p.rows[0].weight_rationale}, ${callId}, ${reason}, 'live')
        RETURNING id
      `)) as unknown as { id: string }[];

      for (const h of p.rows[0].holdings) {
        await tx.execute(sql`
          INSERT INTO basket_constituent (basket_version_id, asset_id, mint, position, weight_bps)
          VALUES (${bv.id}, ${h.assetId}, ${h.mint}, ${h.position}, ${h.weightBps})
        `);
      }

      for (const [n, r] of p.rows.entries()) {
        await tx.execute(sql`
          INSERT INTO basket_thesis (basket_version_id, thesis_version_id, role, attached_at)
          VALUES (${bv.id}, ${r.version_id}, ${n === 0 ? "origin" : "argument"}, ${r.published_at})
        `);
      }

      // Last, and explicitly: this is the column a buy resolves to. Setting it fires the span
      // trigger, which opens the current execution span.
      await tx.execute(sql`
        UPDATE basket SET status = 'live', execution_version_id = ${bv.id}, updated_at = now()
         WHERE id = ${b.id}
      `);
    }

    await verify(tx, plans.length);
  });

  console.log(`\napplied. ${plans.length} baskets.`);
  process.exit(0);
}

/** Everything that must be true before this transaction is allowed to commit. */
async function verify(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], expected: number) {
  const checks: [string, string][] = [
    ["baskets created", `SELECT count(*)::int FROM basket`],
    ["every basket live with a pointer", `SELECT count(*)::int FROM basket WHERE status='live' AND execution_version_id IS NOT NULL`],
    ["exactly one live version each", `SELECT count(*)::int FROM (SELECT basket_id FROM basket_version WHERE state='live' GROUP BY basket_id HAVING count(*)=1) x`],
    ["distinct allocation keys", `SELECT count(DISTINCT allocation_key)::int FROM basket_version`],
  ];
  for (const [label, q] of checks) {
    const [r] = (await tx.execute<{ count: number }>(sql.raw(q))) as unknown as { count: number }[];
    console.log(`  ${String(r.count).padStart(4)}  ${label}`);
  }

  const [fixtures] = (await tx.execute<{ count: number }>(sql`
    SELECT count(*)::int FROM basket_thesis bt
      JOIN thesis_version tv ON tv.id = bt.thesis_version_id
      JOIN thesis th ON th.id = tv.thesis_id
     WHERE th.slug LIKE 'fixture-%' OR th.author_name = 'Thesis fixtures'
  `)) as unknown as { count: number }[];
  if (fixtures.count !== 0) throw new Error(`${fixtures.count} fixture versions attached to a basket`);

  const [mismatched] = (await tx.execute<{ count: number }>(sql`
    SELECT count(*)::int FROM basket b
      JOIN basket_version bv ON bv.id = b.execution_version_id
     WHERE bv.allocation_key <> (
       SELECT coalesce(string_agg(bc.mint || ':' || bc.weight_bps, '|' ORDER BY bc.mint COLLATE "C"), '')
         FROM basket_constituent bc WHERE bc.basket_version_id = bv.id)
  `)) as unknown as { count: number }[];
  if (mismatched.count !== 0) throw new Error(`${mismatched.count} execution versions disagree with their holdings`);

  const [live] = (await tx.execute<{ count: number }>(sql`SELECT count(*)::int FROM basket WHERE status='live'`)) as unknown as { count: number }[];
  if (live.count < expected) throw new Error(`expected at least ${expected} live baskets, got ${live.count}`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
