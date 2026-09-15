import { afterAll, describe, expect, it } from "vitest";
import { sql } from "../db/client";

/**
 * The database guard on thesis_call, proved clause by clause.
 *
 * Every case runs inside a transaction that is always rolled back, so the real calls --
 * which are open and must not be reset or backdated -- are never touched. The row each
 * test works on is inserted inside that same transaction and disappears with it.
 *
 * These matter because a timed call is a public claim. If its rules, its starting
 * observation or its result could be edited afterwards, the claim would be worthless: you
 * could always move the goalposts to win.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = describe.skipIf(!HAS_DB);

class Rollback extends Error {}

/** Run inside a transaction and always roll back, returning whatever the body threw. */
async function inRolledBackTx(body: (tx: typeof sql) => Promise<void>): Promise<string | null> {
  let caught: string | null = null;
  try {
    await sql.begin(async (tx) => {
      try {
        await body(tx as unknown as typeof sql);
      } catch (error) {
        caught = (error as Error).message;
      }
      throw new Rollback("always roll back");
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return caught;
}

/**
 * A fresh open call, 90 days, started an hour ago. Exists only inside the transaction.
 *
 * Timestamps and jsonb go in as strings with an explicit cast: postgres.js 3.4.9 hands a
 * raw Date straight to its byte writer here and throws, and it reads a JS array as a
 * Postgres ARRAY rather than jsonb.
 */
async function seedCall(tx: typeof sql, over: { endsAt?: string; startsAt?: string } = {}) {
  const startsAt = over.startsAt ?? new Date(Date.now() - 3600_000).toISOString();
  const start = { basketUsdcRaw: "150000000", benchmarkUsdcRaw: "150000000", observedAt: startsAt, startedAt: startsAt, complete: true };
  // A version that has no call yet, so this can never collide with -- or update -- one of
  // the real open calls, even though the transaction is rolled back either way.
  const [version] = await tx`
    select id from thesis_version
     where id not in (select version_id from thesis_call)
     limit 1`;
  const [row] = await tx`
    insert into thesis_call (version_id, statement, benchmark, duration_days, rules, holdings,
      benchmark_holding, starts_at, ends_at, start_snapshot, latest_snapshot, status)
    values (${version.id}, ${"test call"}, ${"SPYx"}, ${90}, ${"fixed quantities vs benchmark"},
      ${JSON.stringify([{ symbol: "MSFTx", raw: "1" }])}::jsonb, ${JSON.stringify({ symbol: "SPYx", raw: "1" })}::jsonb,
      ${startsAt}::timestamptz, ${over.endsAt ?? new Date(Date.now() + 86_400_000).toISOString()}::timestamptz,
      ${JSON.stringify(start)}::jsonb, ${JSON.stringify(start)}::jsonb, ${"open"})
    returning id, ends_at`;
  return { id: row.id as string, endsAt: row.ends_at as Date, start };
}

d("the thesis_call guard", () => {
  it("refuses to delete a published call", async () => {
    const error = await inRolledBackTx(async (tx) => {
      const { id } = await seedCall(tx);
      await tx`delete from thesis_call where id = ${id}`;
    });
    expect(error).toMatch(/cannot be deleted/i);
  });

  it("refuses to change the rules or the starting observation", async () => {
    const duration = await inRolledBackTx(async (tx) => {
      const { id } = await seedCall(tx);
      await tx`update thesis_call set duration_days = 30 where id = ${id}`;
    });
    expect(duration).toMatch(/immutable/i);

    const holdings = await inRolledBackTx(async (tx) => {
      const { id } = await seedCall(tx);
      await tx`update thesis_call set holdings = ${JSON.stringify([{ symbol: "NVDAx", raw: "9" }])}::jsonb where id = ${id}`;
    });
    expect(holdings).toMatch(/immutable/i);

    const startSnapshot = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx);
      await tx`update thesis_call set start_snapshot = ${JSON.stringify({ ...start, basketUsdcRaw: "1" })}::jsonb where id = ${id}`;
    });
    expect(startSnapshot).toMatch(/immutable/i);
  });

  it("refuses an observation that moves backwards in time", async () => {
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx);
      const older = { ...start, observedAt: new Date(Date.now() - 7200_000).toISOString() };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(older)}::jsonb where id = ${id}`;
    });
    expect(error).toMatch(/backwards/i);
  });

  it("accepts a forward observation while the call is open", async () => {
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx);
      const newer = { ...start, observedAt: new Date().toISOString(), basketUsdcRaw: "151000000" };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(newer)}::jsonb where id = ${id}`;
    });
    expect(error).toBeNull();
  });

  it("refuses to resolve before the deadline has passed", async () => {
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx);
      const now = { ...start, observedAt: new Date().toISOString(), startedAt: new Date().toISOString(), basketUsdcRaw: "160000000" };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(now)}::jsonb, status = 'hit' where id = ${id}`;
    });
    expect(error).toMatch(/deadline window/i);
  });

  it("refuses a result that contradicts the observed return", async () => {
    const endsAt = new Date(Date.now() - 3600_000).toISOString();
    const startsAt = new Date(Date.now() - 7200_000).toISOString();
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx, { endsAt, startsAt });
      // The basket fell against the benchmark, so this is a miss. Claim a hit.
      const after = {
        ...start,
        startedAt: new Date(Date.now() - 1800_000).toISOString(),
        observedAt: new Date().toISOString(),
        basketUsdcRaw: "140000000",
        benchmarkUsdcRaw: "150000000",
      };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(after)}::jsonb, status = 'hit' where id = ${id}`;
    });
    expect(error).toMatch(/must match its observed relative return/i);
  });

  it("accepts the result the observation actually supports", async () => {
    const endsAt = new Date(Date.now() - 3600_000).toISOString();
    const startsAt = new Date(Date.now() - 7200_000).toISOString();
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx, { endsAt, startsAt });
      const after = {
        ...start,
        startedAt: new Date(Date.now() - 1800_000).toISOString(),
        observedAt: new Date().toISOString(),
        basketUsdcRaw: "160000000",
        benchmarkUsdcRaw: "150000000",
      };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(after)}::jsonb, status = 'hit' where id = ${id}`;
    });
    expect(error).toBeNull();
  });

  it("refuses to mark a call unresolved before its window closes", async () => {
    const error = await inRolledBackTx(async (tx) => {
      const { id } = await seedCall(tx);
      await tx`update thesis_call set status = 'unresolved' where id = ${id}`;
    });
    expect(error).toMatch(/window has not ended/i);
  });

  it("refuses to change a call once it is resolved", async () => {
    const endsAt = new Date(Date.now() - 3600_000).toISOString();
    const startsAt = new Date(Date.now() - 7200_000).toISOString();
    const error = await inRolledBackTx(async (tx) => {
      const { id, start } = await seedCall(tx, { endsAt, startsAt });
      const after = {
        ...start,
        startedAt: new Date(Date.now() - 1800_000).toISOString(),
        observedAt: new Date().toISOString(),
        basketUsdcRaw: "160000000",
        benchmarkUsdcRaw: "150000000",
      };
      await tx`update thesis_call set latest_snapshot = ${JSON.stringify(after)}::jsonb, status = 'hit' where id = ${id}`;
      // now try to walk it back
      await tx`update thesis_call set status = 'miss' where id = ${id}`;
    });
    expect(error).toMatch(/Resolved calls cannot be changed/i);
  });
});

afterAll(async () => {
  if (HAS_DB) await sql.end();
});
