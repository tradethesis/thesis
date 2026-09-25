import { authed, err } from "@/server/api";
import { IMAGE_LIMITS, saveImage } from "@/server/gifts/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a pack photo: the raw bytes the browser re-encoded, with its size in the query string.
 * The wallet comes from the session. Size is checked before the body is read.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > IMAGE_LIMITS.maxBytes) return err("too_large", "That photo is too large. Try another one.", 413);
  const url = new URL(request.url);
  const width = Number(url.searchParams.get("w"));
  const height = Number(url.searchParams.get("h"));
  return authed(async (wallet) => {
    const buf = Buffer.from(await request.arrayBuffer());
    return saveImage(wallet, buf, width, height);
  });
}
