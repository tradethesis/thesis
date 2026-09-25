import { readImage } from "@/server/gifts/images";

export const runtime = "nodejs";

/**
 * A pack photo. Cached by the browser for an hour and never by the CDN: a new photo is a new id,
 * but a takedown has to work, and a year-long shared cache would keep serving a removed image.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await readImage(id);
  if (!image) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
