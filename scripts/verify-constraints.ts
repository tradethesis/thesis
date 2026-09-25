/**
 * Prove the database guards exist and still bite.
 *
 *   pnpm tsx scripts/verify-constraints.ts
 *
 * Everything in constraints.sql is invisible to drizzle-kit, so a bare `drizzle-kit push
 * --force` reads these as drift and drops them. The ones whose loss is silent are the dangerous
 * ones: nothing fails at write time, and the damage shows up later as a basket displaying
 * returns it never earned, or a wallet with two open baskets at once.
 *
 * Existence is checked by name. Behaviour is checked by attempting the thing the guard forbids
 * inside a transaction that is always rolled back — a guard that exists but no longer fires is
 * worth exactly nothing, and that is not visible in pg_trigger.
 */

import { sql } from "drizzle-orm";

import { db } from "../src/server/db/client";

const TRIGGERS = [
  "basket_version_allocation_valid",
  "basket_constituent_allocation_valid",
  "basket_version_immutable_trg",
  "basket_constituent_immutable_trg",
  "basket_version_call_matches_trg",
  "basket_thesis_allocation_valid",
  "basket_execution_pointer_trg",
  "basket_execution_span_trg",
  "basket_execution_span_append_only_trg",
  "intent_names_allocation_trg",
  "thesis_version_immutable_trg",
  "thesis_constituent_immutable_trg",
];

const INDEXES = [
  "basket_version_allocation_key",
  "basket_version_one_live",
  "basket_version_one_call",
  "basket_thesis_one_origin",
  "basket_thesis_version_key",
  "basket_span_one_open",
  // Pre-existing, and the one the file header singles out: the only thing stopping a wallet
  // opening a second basket while the first is still settling.
  "intent_one_open_per_wallet",
];

let failures = 0;
const ok = (label: string, detail = "") => console.log(`  ok   ${label}${detail ? `  ${detail}` : ""}`);
const bad = (label: string, detail = "") => {
  failures += 1;
  console.log(`  FAIL ${label}${detail ? `  ${detail}` : ""}`);
};

/**
 * Run something that must be refused. Always rolls back.
 *
 * `SET CONSTRAINTS ALL IMMEDIATE` is what makes this work on the deferred triggers. They fire at
 * COMMIT, and this transaction is deliberately never committed — so without forcing the check,
 * an aborted transaction looks exactly like a guard that did not fire. That is how the first run
 * of this script reported two false failures.
 */
async function mustRefuse(label: string, body: string) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(body));
      await tx.execute(sql.raw("SET CONSTRAINTS ALL IMMEDIATE"));
      throw new Error("__not_refused__");
    });
    bad(label, "was allowed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("__not_refused__")) bad(label, "was allowed");
    else ok(label, message.split("\n")[0].slice(0, 76));
  }
}

async function main() {
  console.log("triggers");
  const trigRows = (await db.execute<{ tgname: string }>(sql`
    SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
  `)) as unknown as { tgname: string }[];
  const present = new Set(trigRows.map((r) => r.tgname));
  for (const t of TRIGGERS) (present.has(t) ? ok : bad)(t);

  console.log("\nindexes");
  const idxRows = (await db.execute<{ indexname: string }>(sql`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `)) as unknown as { indexname: string }[];
  const idx = new Set(idxRows.map((r) => r.indexname));
  for (const i of INDEXES) (idx.has(i) ? ok : bad)(i);

  console.log("\nguards that must still bite");

  const [bv] = (await db.execute<{ id: string; basket_id: string; allocation_key: string }>(sql`
    SELECT id, basket_id, allocation_key FROM basket_version WHERE state = 'live' LIMIT 1
  `)) as unknown as { id: string; basket_id: string; allocation_key: string }[];

  if (!bv) {
    console.log("  (no baskets yet — behaviour checks skipped)");
  } else {
    await mustRefuse(
      "a published allocation cannot be re-weighted",
      `UPDATE basket_constituent SET weight_bps = 5000 WHERE basket_version_id = '${bv.id}'`,
    );
    await mustRefuse(
      "a published basket version cannot be deleted",
      `DELETE FROM basket_version WHERE id = '${bv.id}'`,
    );
    await mustRefuse(
      "a version cannot claim an allocation it does not hold",
      `INSERT INTO basket_version (basket_id, version_number, chain, allocation_key, state)
       VALUES ('${bv.basket_id}', 99, 'solana', 'SomeMint:10000', 'draft')`,
    );
    /* Only meaningful where a fixture exists to try. An INSERT ... SELECT that matches no rows
       raises nothing, which is indistinguishable from a guard that did not fire — that is how this
       reported a false failure against a database with no fixtures in it. */
    const [fixture] = (await db.execute<{ id: string }>(sql`
      SELECT tv.id FROM thesis_version tv JOIN thesis th ON th.id = tv.thesis_id
       WHERE th.slug LIKE 'fixture-%' OR th.author_name = 'Thesis fixtures' LIMIT 1
    `)) as unknown as { id: string }[];
    if (fixture) {
      await mustRefuse(
        "a fixture cannot be attached to a basket",
        `INSERT INTO basket_thesis (basket_version_id, thesis_version_id, role)
         VALUES ('${bv.id}', '${fixture.id}', 'argument')`,
      );
    } else {
      console.log("  --   a fixture cannot be attached to a basket  (no fixtures here to try)");
    }
    await mustRefuse(
      "an intent must name the allocation it executes",
      `INSERT INTO investment_intent (idempotency_key, wallet, thesis_version_id, direction,
                                      budget_raw, input_mint, weights_bps, status, execution_mode)
       SELECT 'guard-probe', '38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L', tv.id, 'buy',
              1000000, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '[]'::jsonb, 'draft', 'simulation'
         FROM thesis_version tv LIMIT 1`,
    );
    await mustRefuse(
      "execution history cannot be rewritten",
      `UPDATE basket_execution_span SET basket_version_id = '${bv.id}', started_at = now() - interval '1 year'
        WHERE ended_at IS NULL`,
    );
  }

  console.log(failures ? `\n${failures} problem(s).` : "\nevery guard present and biting.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
