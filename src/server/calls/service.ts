import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callObservation, thesisCall, thesisVersion } from "../db/schema";
import { getPublishedThesis } from "../content/detail";
import { listPublishedTheses } from "../content/queries";
import { CRYPTO_ASSETS, EQUITY_ASSETS, PRESTOCKS_ASSETS, assetByMint } from "../assets/allowlist";
import { litePrices } from "../jupiter/client";
import { allocate } from "@/lib/money/allocate";
import { CALL_DURATION_DAYS, CALL_RULES, basketKey, RESOLUTION_WINDOW_MS, resolutionState, scoreCall, type CallHolding, type CallRecord, type CallSnapshot } from "@/lib/calls";

const MODEL_BUDGET = 150_000_000n;
const BENCHMARK = EQUITY_ASSETS.find(a => a.symbol === "SPYx")!;
/** What a model basket may hold: anything tradable on the allowlist, never the quote asset. */
const CALLABLE_ASSETS = [...EQUITY_ASSETS, ...CRYPTO_ASSETS, ...PRESTOCKS_ASSETS];

/*
  The reference-quote helper that used to live here is gone with its last caller.
  It asked Jupiter what a holding would sell for, checked the route's quality, and returned
  the proceeds — correct, and four requests per basket. Calls are struck and measured from
  the price feed now: one request covers every mint of every open call, which took a full
  refresh from about seven minutes and twenty-seven of sixty-four succeeding to two seconds
  and all of them.

  Quotes are still the right tool where a quote is the question — an order that is about to
  be signed needs to know what a route will actually fill at, impact included. That path is
  untouched in src/server/execution.
*/


/**
 * Value a basket from the price feed, in one request.
 *
 * This replaced a sell quote per holding, for two reasons and in that order.
 *
 * It is more correct. A call is explicitly a *model* basket measured against a benchmark,
 * and the card says so every time it shows a number. A model is valued at mid, the way an
 * index is; a sell quote answers a different question — "what would I get if I liquidated
 * this size right now" — and folds route price impact into a figure that is not supposed to
 * belong to any particular buyer.
 *
 * And it is affordable. Quoting every holding of every open call cost roughly two hundred
 * and forty requests per refresh, which the free tier answers with 429s: on the last
 * quote-based run, thirty-seven of sixty-four calls came back "price unavailable" after
 * nearly seven minutes. One price request covers every mint at once.
 *
 * `outRaw` keeps its meaning — USDC base units for the amount held — so everything
 * downstream, including the stored snapshots and the per-asset map, reads unchanged.
 */
export async function observe(
  holdings: CallHolding[],
  benchmark: CallHolding,
  /**
   * Prices already fetched for a whole batch of calls.
   *
   * Sixty-four calls hold about twenty distinct mints between them, so fetching per call
   * asks the same question sixty-four times. The refresh reads every mint once and hands
   * the answer down; a lone call with no batch still fetches its own.
   */
  shared?: Map<string, Awaited<ReturnType<typeof litePrices>> extends Map<string, infer V> ? V : never>,
): Promise<CallSnapshot> {
  const startedAt = new Date();
  const all = [...holdings, benchmark];
  const prices = shared ?? (await litePrices(all.map(h => h.mint)));

  const quotes = all.map(h => {
    const price = prices.get(h.mint);
    if (!price || !(price.usdPrice > 0)) throw new Error(`No price for ${h.symbol}.`);

    const asset = assetByMint(h.mint);
    if (!asset) throw new Error(`${h.symbol} is not on the allowlist.`);

    // Base units in, base units out. The multiplier is read from the feed rather than the
    // allowlist because the issuer can change it, and a stale one silently misprices the
    // holding by whatever the change was.
    const scale = price.scaledUiConfig?.multiplier ?? 1;
    const units = (Number(h.amountRaw) / 10 ** asset.decimals) * scale;
    const usdc = BigInt(Math.round(units * price.usdPrice * 1e6));
    if (usdc <= 0n) throw new Error(`${h.symbol} valued at zero.`);

    return { mint: h.mint, amountRaw: h.amountRaw, outRaw: usdc.toString(), contextSlot: price.blockId ?? 0 };
  });

  if (Date.now() - startedAt.getTime() > 30_000) throw new Error("Prices were not fresh enough.");

  return {
    startedAt: startedAt.toISOString(), observedAt: new Date().toISOString(),
    basketUsdcRaw: quotes.slice(0, holdings.length).reduce((s, q) => s + BigInt(q.outRaw), 0n).toString(),
    benchmarkUsdcRaw: quotes[quotes.length - 1].outRaw, quotes,
  };
}

export async function startCall(slug: string) {
  const t = await getPublishedThesis(slug);
  if (!t) throw new Error("Published thesis not found.");
  const [existing] = await db.select().from(thesisCall).where(eq(thesisCall.versionId, t.versionId));
  if (existing) return existing.id;
  const split = allocate(MODEL_BUDGET, t.holdings.map((h, i) => ({ assetId: h.symbol, positionIndex: i, bps: h.weightBps })));

  // Every tradable asset, not only the equities. A crypto holding used to throw here, which
  // is why the crypto theses had no call — and because startEditorialCalls awaited in a bare
  // loop, the first one to throw stopped every thesis after it from being struck at all.
  const chosen = t.holdings.map(h => {
    const asset = CALLABLE_ASSETS.find(a => a.symbol === h.symbol && a.enabled);
    if (!asset) throw new Error("This holding is not on the active allowlist.");
    return { asset, weightBps: h.weightBps, usdcRaw: split.find(s => s.assetId === h.symbol)!.amountRaw };
  });

  // Sized at mid, the same basis the call is measured on. Deriving the opening quantities
  // from a swap quote and then measuring them against a price feed would bake one leg's
  // price impact into the starting position and show it as performance for ninety days.
  const prices = await litePrices([...chosen.map(c => c.asset.mint), BENCHMARK.mint]);
  const unitsFor = (mint: string, symbol: string, usdcRaw: bigint) => {
    const price = prices.get(mint);
    if (!price || !(price.usdPrice > 0)) throw new Error(`No price for ${symbol}.`);
    const asset = assetByMint(mint)!;
    const scale = price.scaledUiConfig?.multiplier ?? 1;
    const units = Number(usdcRaw) / 1e6 / price.usdPrice / scale;
    const raw = BigInt(Math.round(units * 10 ** asset.decimals));
    if (raw <= 0n) throw new Error(`${symbol} sized to zero.`);
    return raw.toString();
  };

  const holdings = chosen.map(c => ({
    mint: c.asset.mint,
    symbol: c.asset.symbol,
    amountRaw: unitsFor(c.asset.mint, c.asset.symbol, c.usdcRaw),
    weightBps: c.weightBps,
  }));
  const benchmarkHolding = {
    mint: BENCHMARK.mint,
    symbol: BENCHMARK.symbol,
    amountRaw: unitsFor(BENCHMARK.mint, BENCHMARK.symbol, MODEL_BUDGET),
    weightBps: 10_000,
  };
  const start = await observe(holdings, benchmarkHolding);
  const startsAt = new Date(start.observedAt);
  const [created] = await db.insert(thesisCall).values({
    versionId: t.versionId, statement: "This basket will outperform SPYx over 90 days.",
    benchmark: "SPYx", durationDays: CALL_DURATION_DAYS, rules: CALL_RULES,
    holdings, benchmarkHolding, startsAt,
    endsAt: new Date(startsAt.getTime() + CALL_DURATION_DAYS * 86_400_000),
    startSnapshot: start, latestSnapshot: start,
  }).onConflictDoNothing({ target: thesisCall.versionId }).returning({ id: thesisCall.id });

  /*
   * The opening mark goes into the series too, not only onto the call.
   *
   * It lived only on `start_snapshot` until 21 September 2026, so `loadSeries` baselined the
   * chart on the first cron reading — up to a day later — while `rankCalls` scored from the true
   * origin. The two numbers were computed from different zeroes and the chart's caption said
   * "since the call started", which was false. Writing it here is what stops that returning.
   */
  if (created) {
    await db.insert(callObservation).values({
      callId: created.id,
      observedAt: new Date(start.observedAt),
      basketUsdcRaw: start.basketUsdcRaw,
      benchmarkUsdcRaw: start.benchmarkUsdcRaw,
    }).onConflictDoNothing();
  }

  /*
   * Point the basket at its series.
   *
   * A basket and its call are created by different steps and in either order: publishing creates
   * the basket, striking creates the call. Whichever runs second has to close the loop, or the
   * basket renders "Tracking begins at publication" forever beside a call that is running.
   *
   * Matched on the allocation, never on identity — `basket_version_call_matches_trg` re-derives
   * the key from the call's own frozen holdings and refuses a mismatch, so a call can never end up
   * under a basket it did not measure. `call_id IS NULL` keeps this from overwriting a series that
   * was already chosen; the trigger forbids that anyway.
   */
  if (created) {
    await db.execute(sql`
      UPDATE basket_version bv
         SET call_id = ${created.id}, call_selection_reason = 'struck_for_this_allocation'
        FROM basket_thesis bt
       WHERE bt.basket_version_id = bv.id
         AND bt.thesis_version_id = ${t.versionId}
         AND bv.call_id IS NULL
         AND bv.allocation_key = coalesce(
               (SELECT string_agg((h->>'mint') || ':' || (h->>'weightBps'), '|'
                                  ORDER BY (h->>'mint') COLLATE "C")
                  FROM jsonb_array_elements(${JSON.stringify(holdings)}::jsonb) h), '')
    `);
  }

  return created?.id ?? "already_started";
}

/**
 * Take a fresh observation of every open call.
 *
 * Sequential, not Promise.all. Each call quotes every holding plus the benchmark, so fifty
 * open calls fired at once is a burst of two hundred quotes the free tier answers with 429s
 * — and a rate limit reads downstream as "price unavailable", which is how the catalogue
 * came to have twelve observations across two days while appearing to run daily. Slower and
 * complete beats fast and mostly failed for a job nobody is waiting on.
 */
export async function refreshCalls() {
  const calls = await db.select().from(thesisCall).where(eq(thesisCall.status, "open"));

  // Every mint across every open call, read once. This is the whole cost of a refresh now:
  // one request, where quoting each holding of each call was roughly two hundred and forty
  // and spent most of them being refused.
  const mints = new Set<string>();
  for (const c of calls) {
    for (const h of c.holdings as CallHolding[]) mints.add(h.mint);
    mints.add((c.benchmarkHolding as CallHolding).mint);
  }
  const prices = await litePrices([...mints]);

  const results = [];
  for (const c of calls) {
    results.push(await (async () => {
    try {
      if (Date.now() > c.endsAt.getTime() + RESOLUTION_WINDOW_MS) {
        await db.update(thesisCall).set({ status: "unresolved", lastError: "No complete observation arrived within the resolution window.", updatedAt: new Date() })
          .where(and(eq(thesisCall.id, c.id), eq(thesisCall.status, "open")));
        return { id: c.id, status: "unresolved" };
      }
      const snapshot = await observe(c.holdings, c.benchmarkHolding, prices);
      const phase = resolutionState(c.endsAt.toISOString(), snapshot);
      const status = phase === "resolve" ? scoreCall(c.startSnapshot, snapshot).outcome : phase;
      await db.transaction(async tx => {
        const [current] = await tx.select().from(thesisCall).where(eq(thesisCall.id, c.id)).for("update");
        if (current.status !== "open" || current.latestSnapshot.observedAt >= snapshot.observedAt) return;
        await tx.update(thesisCall).set({ latestSnapshot: snapshot, status, lastError: null, updatedAt: new Date() }).where(eq(thesisCall.id, c.id));

        // Append the point as well as replacing the latest one. The update keeps scoring
        // cheap; this keeps the history, which the update destroys. In the same transaction
        // so a chart can never show a point the call itself never reached, and ignoring a
        // conflict so a retried refresh does not plot the same observation twice.
        await tx
          .insert(callObservation)
          .values({
            callId: c.id,
            observedAt: new Date(snapshot.observedAt),
            basketUsdcRaw: snapshot.basketUsdcRaw,
            benchmarkUsdcRaw: snapshot.benchmarkUsdcRaw,
          })
          .onConflictDoNothing();
      });
      return { id: c.id, status };
    } catch {
      await db.update(thesisCall).set({ lastError: "A complete, fresh reference quote is unavailable. The previous observation is retained.", updatedAt: new Date() })
        .where(and(eq(thesisCall.id, c.id), eq(thesisCall.status, "open")));
      return { id: c.id, status: "price_unavailable" };
    }
  })());
  }
  return results;
}

/**
 * Strike a call on every published thesis that does not have one.
 *
 * One failure must not stop the rest. Sequential on purpose — striking a call takes a live
 * quote per holding, and firing fifty baskets at the quote API at once gets the whole run
 * rate-limited into failures that look like missing routes.
 */
export async function startEditorialCalls() {
  const theses = await listPublishedTheses();
  const results = [];
  for (const t of theses) {
    try {
      results.push({ slug: t.slug, id: await startCall(t.slug) });
    } catch (e) {
      results.push({ slug: t.slug, error: e instanceof Error ? e.message : "Call could not be struck." });
    }
  }
  return results;
}

export async function getCalls(): Promise<CallRecord[]> {
  // Joined up to the thesis so a call can be matched to it rather than to the one version
  // it was struck against. See callForThesis in src/lib/calls.ts for why.
  const rows = await db
    .select({ call: thesisCall, thesisId: thesisVersion.thesisId })
    .from(thesisCall)
    .innerJoin(thesisVersion, eq(thesisCall.versionId, thesisVersion.id));

  return rows.map(({ call: r, thesisId }) => ({
    id: r.id, versionId: r.versionId, thesisId,
    basketKey: basketKey(r.holdings as { mint: string; weightBps: number }[]),
    statement: r.statement, rules: r.rules, benchmark: r.benchmark,
    durationDays: r.durationDays, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
    status: r.status as CallRecord["status"], start: r.startSnapshot, latest: r.latestSnapshot, lastError: r.lastError,
  }));
}


/**
 * Refresh the calls if nobody has for a while, after the page that noticed has responded.
 *
 * Production has a daily scheduler (vercel.json crons); preview deployments have none, so beta's
 * numbers used to freeze at whatever day they were last refreshed. This keeps any deployment's
 * record current from ordinary traffic, and covers production if its scheduler ever misses a day.
 * One run at a time per instance; a rare overlap between instances only writes a second reading.
 */
let refreshing = false;
export async function refreshCallsIfStale(maxAgeMs = 20 * 60 * 60 * 1000): Promise<void> {
  if (refreshing) return;
  const [row] = await db.select({ last: sql<Date | null>`max(${callObservation.observedAt})` }).from(callObservation);
  const last = row?.last ? new Date(row.last).getTime() : 0;
  if (Date.now() - last < maxAgeMs) return;
  refreshing = true;
  try {
    await refreshCalls();
  } catch (error) {
    console.error("[calls] stale refresh failed", error);
  } finally {
    refreshing = false;
  }
}
