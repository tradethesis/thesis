import { and, eq, inArray, lt, or } from "drizzle-orm";
import { err, ok } from "@/server/api";
import { db } from "@/server/db/client";
import { investmentIntent, swapLeg } from "@/server/db/schema";
import { reconcileIntent } from "@/server/execution/intents";
import { env } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The safety net for the user who closed the tab.
 *
 * The real work happens in the foreground — the progress screen polling the intent — so
 * this only has to catch what nobody is watching. It is not the primary path and must never
 * become it.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${env.cronSecret()}`;
  if (auth !== expected) return err("forbidden", "Not authorised.", 401);

  const stale = new Date(Date.now() - 30_000);
  const rows = await db
    .selectDistinct({ intentId: swapLeg.intentId })
    .from(swapLeg)
    .innerJoin(investmentIntent, eq(investmentIntent.id, swapLeg.intentId))
    .where(
      and(
        inArray(swapLeg.status, ["submitted", "unknown"]),
        or(lt(swapLeg.updatedAt, stale), eq(investmentIntent.status, "needs_reconciliation")),
      ),
    )
    .limit(25);

  let resolved = 0;
  for (const row of rows) resolved += await reconcileIntent(row.intentId);
  return ok({ scanned: rows.length, resolved });
}
