import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { gift, giftEvent } from "../db/schema";

import { assertTransition, type GiftState } from "./lifecycle";

/**
 * The only code that writes a gift.
 *
 * Every state change goes through `transition`, which does three things in one database
 * transaction:
 *
 *   1. **Replays** a request it has already done. The idempotency key is unique in the ledger; a
 *      retried request with the same key gets the recorded outcome and acts on nothing.
 *   2. **Compares and sets.** The update is `WHERE id = $1 AND state = $from`. Two callers racing
 *      for the same edge — two claims, a claim and a cancel — cannot both win: one row changes, the
 *      other caller is told what the state now is.
 *   3. **Appends to the ledger.** The event row and the state change commit together or not at all.
 *
 * The migration's CHECKs and triggers are the second line: a state without its evidence, or terms
 * changed after payment was requested, is refused by the database even if this module is wrong.
 */

export type GiftRow = typeof gift.$inferSelect;

export class GiftConflict extends Error {
  constructor(
    readonly expected: GiftState,
    readonly actual: GiftState | null,
  ) {
    super(actual ? `This gift is ${actual}, not ${expected}.` : "No such gift.");
    this.name = "GiftConflict";
  }
}

/** 128 random bits, shown to the sender once. Only the hash is stored. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(16).toString("base64url");
  return { token, hash: hashInvite(token) };
}

export function hashInvite(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Detail for the ledger. Typed so a note or handle cannot be put in by accident. */
export type EventDetail = Record<string, string | number | boolean | null>;

type Patch = Partial<Omit<typeof gift.$inferInsert, "id" | "state" | "inviteHash" | "createdAt" | "updatedAt">>;

export type TransitionResult = { gift: GiftRow; replayed: boolean };

export async function transition(args: {
  giftId: string;
  from: GiftState;
  to: GiftState;
  idempotencyKey: string;
  patch?: Patch;
  detail?: EventDetail;
}): Promise<TransitionResult> {
  assertTransition(args.from, args.to);

  return db.transaction(async (tx) => {
    const seen = await tx
      .select({ giftId: giftEvent.giftId })
      .from(giftEvent)
      .where(eq(giftEvent.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (seen.length) {
      if (seen[0].giftId !== args.giftId) throw new Error("Idempotency key reused for a different gift.");
      const [row] = await tx.select().from(gift).where(eq(gift.id, args.giftId));
      return { gift: row, replayed: true };
    }

    const updated = await tx
      .update(gift)
      .set({ ...(args.patch ?? {}), state: args.to })
      .where(and(eq(gift.id, args.giftId), eq(gift.state, args.from)))
      .returning();

    if (!updated.length) {
      const [current] = await tx.select({ state: gift.state }).from(gift).where(eq(gift.id, args.giftId));
      throw new GiftConflict(args.from, (current?.state as GiftState) ?? null);
    }

    await tx.insert(giftEvent).values({
      giftId: args.giftId,
      idempotencyKey: args.idempotencyKey,
      fromState: args.from,
      toState: args.to,
      detail: args.detail ?? {},
    });

    return { gift: updated[0], replayed: false };
  });
}

export async function createDraft(args: {
  packId: string;
  basketVersionId: string;
  amountUsd: number;
  solAllowanceLamports: bigint;
  senderWallet: string;
  senderName: string;
  note: string;
  recipientHandle: string;
  idempotencyKey: string;
  inviteTtlDays?: number;
  centerImageId?: string | null;
}): Promise<{ gift: GiftRow; inviteToken: string | null; replayed: boolean }> {
  return db.transaction(async (tx) => {
    const seen = await tx
      .select({ giftId: giftEvent.giftId })
      .from(giftEvent)
      .where(eq(giftEvent.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (seen.length) {
      const [row] = await tx.select().from(gift).where(eq(gift.id, seen[0].giftId));
      // The token was shown once, on the original response. A replay cannot recover it, and must
      // not mint a second one for the same gift.
      return { gift: row, inviteToken: null, replayed: true };
    }

    const { token, hash } = newInviteToken();
    const [row] = await tx
      .insert(gift)
      .values({
        inviteHash: hash,
        inviteExpiresAt: new Date(Date.now() + (args.inviteTtlDays ?? 30) * 86_400_000),
        packId: args.packId,
        basketVersionId: args.basketVersionId,
        amountUsd: args.amountUsd,
        amountRaw: (BigInt(args.amountUsd) * 1_000_000n).toString(),
        solAllowanceLamports: args.solAllowanceLamports,
        senderWallet: args.senderWallet,
        senderName: args.senderName,
        note: args.note,
        recipientHandleRequested: args.recipientHandle,
        centerImageId: args.centerImageId ?? null,
      })
      .returning();

    await tx.insert(giftEvent).values({
      giftId: row.id,
      idempotencyKey: args.idempotencyKey,
      fromState: null,
      toState: "draft",
      detail: { amountUsd: args.amountUsd, packId: args.packId },
    });

    return { gift: row, inviteToken: token, replayed: false };
  });
}

export async function getGift(id: string): Promise<GiftRow | null> {
  const [row] = await db.select().from(gift).where(eq(gift.id, id));
  return row ?? null;
}

export async function getGiftByInvite(token: string): Promise<GiftRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db.select().from(gift).where(eq(gift.inviteHash, hashInvite(token)));
  return row ?? null;
}

export async function giftEvents(giftId: string) {
  return db.select().from(giftEvent).where(eq(giftEvent.giftId, giftId)).orderBy(giftEvent.id);
}


/* ------------------------------------------------------------------------------------ limits */

/**
 * Abuse limits, counted in the database so they hold across serverless instances (an in-memory
 * counter resets whenever an instance does). Each handle lookup spends X API budget and each draft
 * is a row, so both are capped per signed-in sender wallet. A replay of an idempotency key the
 * ledger already holds is not new work and is never counted against anybody.
 */
export const LIMITS = { draftsPerHour: 10, lookupsPerHour: 20, lookupsPerGift: 5 } as const;

/**
 * Paid X lookups across the whole site, per rolling 24 hours ($0.01 each). Per-wallet limits can be
 * dodged with fresh wallets; this cannot. Past it nobody is blocked — gifts fall back to
 * accept-then-fund until the window rolls. GIFT_X_LOOKUPS_PER_DAY overrides the default.
 */
export function xLookupsPerDay(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GIFT_X_LOOKUPS_PER_DAY);
  return Number.isInteger(n) && n >= 0 ? n : 300;
}

export async function paidLookupsToday(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM gift_event WHERE detail->>'via' = 'x' AND created_at > now() - interval '24 hours'`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function knownIdempotencyKey(key: string): Promise<boolean> {
  const rows = await db.select({ id: giftEvent.id }).from(giftEvent).where(eq(giftEvent.idempotencyKey, key)).limit(1);
  return rows.length > 0;
}

export async function draftsInLastHour(senderWallet: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM gift WHERE sender_wallet = ${senderWallet} AND created_at > now() - interval '1 hour'`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function lookupCounts(giftId: string, senderWallet: string): Promise<{ gift: number; hour: number }> {
  const rows = await db.execute<{ g: number; h: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM gift_event WHERE gift_id = ${giftId} AND detail->>'kind' = 'lookup') AS g,
      (SELECT count(*)::int FROM gift_event e JOIN gift x ON x.id = e.gift_id
        WHERE x.sender_wallet = ${senderWallet} AND e.detail->>'kind' = 'lookup' AND e.created_at > now() - interval '1 hour') AS h`);
  return { gift: Number(rows[0]?.g ?? 0), hour: Number(rows[0]?.h ?? 0) };
}

/** A lookup leaves the state where it was; the ledger row is the record that X was asked. */
export async function recordLookup(g: GiftRow, via: "privy" | "x" | "none" = "none"): Promise<void> {
  await db.insert(giftEvent).values({
    giftId: g.id,
    idempotencyKey: `lookup:${g.id}:${randomBytes(8).toString("hex")}`,
    fromState: g.state,
    toState: g.state,
    detail: { kind: "lookup", via },
  });
}

/** Record why a gift could not be opened here. Not a term of the gift, so not frozen. */
export async function setEligibility(giftId: string, value: "eligible" | "ineligible"): Promise<void> {
  await db.update(gift).set({ eligibility: value }).where(eq(gift.id, giftId));
}

/** A new invitation link for a gift in `state`; the old link stops working. Null if the state moved on. */
export async function replaceInvite(giftId: string, state: GiftState): Promise<string | null> {
  const { token, hash } = newInviteToken();
  const rows = await db.update(gift).set({ inviteHash: hash }).where(and(eq(gift.id, giftId), eq(gift.state, state))).returning({ id: gift.id });
  return rows.length ? token : null;
}
