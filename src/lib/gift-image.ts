"use client";

/**
 * A sender's photo, made ready for the middle of a pack — in the browser, before anything is sent.
 *
 * Square, at most 768px, re-encoded as webp (jpeg where the browser cannot write webp). Re-encoding
 * writes a brand-new file, so nothing from the original's metadata survives: no GPS position, no
 * camera serial, no timestamp riding into somebody else's gift. The server checks the result again
 * (src/server/gifts/images.ts); this is for size and privacy, not trust.
 *
 * Until the sender signs in the photo lives only in this tab (sessionStorage), which is how their
 * own preview shows it. A shared preview link cannot carry an image and shows the pack's motif.
 */

export type PreparedPhoto = { dataUrl: string; width: number; height: number };

const MAX_SIDE = 768;
const MAX_BYTES = 280_000;
const KEY = "thesis:gift-photo";

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't a photo.");
  if (file.size > 25_000_000) throw new Error("That photo is too large. Try another one.");
  let bitmap: ImageBitmap;
  try {
    // Honour the camera's rotation before the metadata that carries it is dropped.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That photo couldn't be opened. Try a JPEG or PNG.");
  }
  const crop = Math.min(bitmap.width, bitmap.height);
  for (const side of [Math.min(MAX_SIDE, crop), 512, 384]) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
    for (const quality of [0.85, 0.72]) {
      let blob = await encode(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
      if (blob && blob.size <= MAX_BYTES) {
        bitmap.close();
        return { dataUrl: await toDataUrl(blob), width: side, height: side };
      }
    }
  }
  bitmap.close();
  throw new Error("That photo couldn't be made small enough. Try another one.");
}

export function savePhoto(photo: PreparedPhoto | null): void {
  try {
    if (photo) sessionStorage.setItem(KEY, JSON.stringify(photo));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Private mode or full storage: the photo shows in the composer but won't reach the preview. */
  }
}

export function readPhoto(): PreparedPhoto | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PreparedPhoto) : null;
  } catch {
    return null;
  }
}

/** Upload the photo once the sender is signed in; returns its id for the gift. */
export async function uploadPhoto(photo: PreparedPhoto): Promise<string> {
  const blob = await (await fetch(photo.dataUrl)).blob();
  const res = await fetch(`/api/gifts/images?w=${photo.width}&h=${photo.height}`, { method: "POST", headers: { "content-type": blob.type }, body: blob });
  const body = (await res.json().catch(() => null)) as { status?: string; id?: string; message?: string; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? "The photo couldn't be uploaded.");
  if (body?.status === "saved" && body.id) return body.id;
  if (body?.status === "rate_limited") throw new Error("That's a lot of photos in a short time. Wait a little, then try again.");
  throw new Error(body?.message ?? "The photo couldn't be uploaded.");
}
