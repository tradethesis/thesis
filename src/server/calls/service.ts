import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { thesisCall } from "../db/schema";
import { getPublishedThesis } from "../content/detail";
import { listPublishedTheses } from "../content/queries";
import { EQUITY_ASSETS, USDC_MINT, assetByMint } from "../assets/allowlist";
import { liteQuote } from "../jupiter/client";
import { rpc } from "../solana/rpc";
import { allocate } from "@/lib/money/allocate";
import { CALL_DURATION_DAYS, CALL_RULES, RESOLUTION_WINDOW_MS, resolutionState, scoreCall, type CallHolding, type CallRecord, type CallSnapshot } from "@/lib/calls";

const MODEL_BUDGET = 150_000_000n;
const BENCHMARK = EQUITY_ASSETS.find(a => a.symbol === "SPYx")!;

async function quote(inputMint: string, outputMint: string, amountRaw: string) {
  if (!assetByMint(inputMint) || !assetByMint(outputMint)) throw new Error("Unverified reference asset.");
  const q = await liteQuote({ inputMint, outputMint, amountRaw: BigInt(amountRaw) });
  if (q.inputMint !== inputMint || q.outputMint !== outputMint || q.inAmount !== amountRaw ||
      !/^\d+$/.test(q.outAmount) || BigInt(q.outAmount) <= 0n || q.swapMode !== "ExactIn" ||
      !Number.isFinite(Number(q.priceImpactPct)) || Math.abs(Number(q.priceImpactPct)) > 1 ||
      !Number.isSafeInteger(q.contextSlot)) throw new Error("Reference quote did not meet the published quality rules.");
  return q;
}

export async function observe(holdings: CallHolding[], benchmark: CallHolding): Promise<CallSnapshot> {
  const startedAt = new Date();
  const quotes = await Promise.all([...holdings, benchmark].map(async h => {
    const q = await quote(h.mint, USDC_MINT, h.amountRaw);
    return { mint: h.mint, amountRaw: h.amountRaw, outRaw: q.outAmount, contextSlot: q.contextSlot };
  }));
  const slot = await rpc<number>("getSlot", [{ commitment: "processed" }], { retries: 1, timeoutMs: 5000 });
  if (!Number.isSafeInteger(slot) || quotes.some(q => slot - q.contextSlot > 450 || q.contextSlot - slot > 100) ||
    Date.now() - startedAt.getTime() > 30_000) throw new Error("Reference quotes were not fresh enough.");
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
  const holdings = await Promise.all(t.holdings.map(async h => {
    const asset = EQUITY_ASSETS.find(a => a.symbol === h.symbol && a.enabled);
    if (!asset) throw new Error("This holding is not on the active allowlist.");
    const q = await quote(USDC_MINT, asset.mint, split.find(s => s.assetId === h.symbol)!.amountRaw.toString());
    return { mint: asset.mint, symbol: h.symbol, amountRaw: q.outAmount, weightBps: h.weightBps };
  }));
  const bq = await quote(USDC_MINT, BENCHMARK.mint, MODEL_BUDGET.toString());
  const benchmarkHolding = { mint: BENCHMARK.mint, symbol: BENCHMARK.symbol, amountRaw: bq.outAmount, weightBps: 10_000 };
  const start = await observe(holdings, benchmarkHolding);
  const startsAt = new Date(start.observedAt);
  const [created] = await db.insert(thesisCall).values({
    versionId: t.versionId, statement: "This basket will outperform SPYx over 90 days.",
    benchmark: "SPYx", durationDays: CALL_DURATION_DAYS, rules: CALL_RULES,
    holdings, benchmarkHolding, startsAt,
    endsAt: new Date(startsAt.getTime() + CALL_DURATION_DAYS * 86_400_000),
    startSnapshot: start, latestSnapshot: start,
  }).onConflictDoNothing({ target: thesisCall.versionId }).returning({ id: thesisCall.id });
  return created?.id ?? "already_started";
}

export async function refreshCalls() {
  const calls = await db.select().from(thesisCall).where(eq(thesisCall.status, "open"));
  return Promise.all(calls.map(async c => {
    try {
      if (Date.now() > c.endsAt.getTime() + RESOLUTION_WINDOW_MS) {
        await db.update(thesisCall).set({ status: "unresolved", lastError: "No complete observation arrived within the resolution window.", updatedAt: new Date() })
          .where(and(eq(thesisCall.id, c.id), eq(thesisCall.status, "open")));
        return { id: c.id, status: "unresolved" };
      }
      const snapshot = await observe(c.holdings, c.benchmarkHolding);
      const phase = resolutionState(c.endsAt.toISOString(), snapshot);
      const status = phase === "resolve" ? scoreCall(c.startSnapshot, snapshot).outcome : phase;
      await db.transaction(async tx => {
        const [current] = await tx.select().from(thesisCall).where(eq(thesisCall.id, c.id)).for("update");
        if (current.status !== "open" || current.latestSnapshot.observedAt >= snapshot.observedAt) return;
        await tx.update(thesisCall).set({ latestSnapshot: snapshot, status, lastError: null, updatedAt: new Date() }).where(eq(thesisCall.id, c.id));
      });
      return { id: c.id, status };
    } catch {
      await db.update(thesisCall).set({ lastError: "A complete, fresh reference quote is unavailable. The previous observation is retained.", updatedAt: new Date() })
        .where(and(eq(thesisCall.id, c.id), eq(thesisCall.status, "open")));
      return { id: c.id, status: "price_unavailable" };
    }
  }));
}

export async function startEditorialCalls() {
  const theses = await listPublishedTheses();
  const results = [];
  for (const t of theses) results.push({ slug: t.slug, id: await startCall(t.slug) });
  return results;
}

export async function getCalls(): Promise<CallRecord[]> {
  const rows = await db.select().from(thesisCall);
  return rows.map(r => ({
    id: r.id, versionId: r.versionId, statement: r.statement, rules: r.rules, benchmark: r.benchmark,
    durationDays: r.durationDays, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
    status: r.status as CallRecord["status"], start: r.startSnapshot, latest: r.latestSnapshot, lastError: r.lastError,
  }));
}
