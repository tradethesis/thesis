import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { giftImage } from "@/server/db/schema";

/**
 * A sender's photo for the middle of the pack.
 *
 * The browser has already re-encoded it (src/lib/gift-image.ts): square, at most 768px, webp or
 * jpeg, and — because re-encoding writes a fresh file — without the original's EXIF, so no GPS
 * position or camera serial rides along into somebody else's gift. This side trusts none of that:
 * it checks the bytes are the format they claim, the size, and who is uploading.
 *
 * Moderation, at beta level: only a signed-in wallet can upload, uploads are rate-limited, an image
 * is reachable only by its unguessable id from a gift or preview, and `removed_at` takes it down
 * everywhere at once. There is no automated classifier yet; that is listed before a public launch.
 */

export const IMAGE_LIMITS = { maxBytes: 300_000, minBytes: 100, perHour: 20 } as const;

export type ImageMime = "image/webp" | "image/jpeg";

/** What the bytes actually are, whatever the request said. */
export function sniff(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export type SaveResult =
  | { status: "saved"; id: string }
  | { status: "invalid"; message: string }
  | { status: "rate_limited" };

export async function saveImage(wallet: string, bytes: Buffer, width: number, height: number): Promise<SaveResult> {
  if (bytes.length < IMAGE_LIMITS.minBytes || bytes.length > IMAGE_LIMITS.maxBytes) {
    return { status: "invalid", message: "That photo is too large. Try another one." };
  }
  const mime = sniff(bytes);
  if (!mime) return { status: "invalid", message: "That file isn't a photo we can use." };
  if (![width, height].every((n) => Number.isInteger(n) && n >= 16 && n <= 2048)) {
    return { status: "invalid", message: "That photo's size couldn't be read." };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // The same photo again is the same image: no new row, no count against the limit.
  const [existing] = await db.select({ id: giftImage.id, removedAt: giftImage.removedAt }).from(giftImage).where(eq(giftImage.sha256, sha256)).limit(1);
  if (existing) {
    if (existing.removedAt) return { status: "invalid", message: "That photo can't be used." };
    return { status: "saved", id: existing.id };
  }

  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(giftImage)
    .where(and(eq(giftImage.uploadedByWallet, wallet), gt(giftImage.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.n ?? 0) >= IMAGE_LIMITS.perHour) return { status: "rate_limited" };

  const [row] = await db
    .insert(giftImage)
    .values({ sha256, mime, bytes, width, height, uploadedByWallet: wallet })
    .onConflictDoNothing()
    .returning({ id: giftImage.id });
  if (row) return { status: "saved", id: row.id };
  // Lost a race with an identical upload; that one's id is the answer.
  const [again] = await db.select({ id: giftImage.id }).from(giftImage).where(eq(giftImage.sha256, sha256)).limit(1);
  return { status: "saved", id: again.id };
}

export async function readImage(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select({ mime: giftImage.mime, bytes: giftImage.bytes })
    .from(giftImage)
    .where(and(eq(giftImage.id, id), isNull(giftImage.removedAt)))
    .limit(1);
  return row ?? null;
}

/** An image a sender may put on their gift: live, and uploaded by that same wallet. */
export async function usableBy(id: string, wallet: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const [row] = await db
    .select({ id: giftImage.id })
    .from(giftImage)
    .where(and(eq(giftImage.id, id), eq(giftImage.uploadedByWallet, wallet), isNull(giftImage.removedAt)))
    .limit(1);
  return Boolean(row);
}

export const imageUrl = (id: string) => `/api/gifts/images/${id}`;
