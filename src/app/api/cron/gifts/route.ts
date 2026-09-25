import { inArray } from "drizzle-orm";

import { err, ok } from "@/server/api";
import { db } from "@/server/db/client";
import { gift } from "@/server/db/schema";
import { chain } from "@/server/execution/chainReader";
import { settleDelivery, settleFunding } from "@/server/gifts/service";

/**
 * The reconciler. Re-reads every gift whose funding or delivery is outstanding.
 *
 * This is what finishes a gift after a crash between the sender's broadcast and confirmation: the
 * signature was recorded before anything else, so the chain can always be asked again. It never
 * builds, signs or sends a transaction, so it can never cause a second transfer.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return err("unauthorized", "No.", 401);

  const open = await db
    .select({ id: gift.id, state: gift.state })
    .from(gift)
    .where(inArray(gift.state, ["funding_pending", "reconciling", "delivering"]))
    .limit(200);

  const results: Record<string, number> = {};
  for (const g of open) {
    const r = g.state === "delivering" ? await settleDelivery(g.id) : await settleFunding(g.id, chain);
    const key = "state" in r && r.state ? `${r.status}:${r.state}` : r.status;
    results[key] = (results[key] ?? 0) + 1;
  }
  return ok({ checked: open.length, results });
}
