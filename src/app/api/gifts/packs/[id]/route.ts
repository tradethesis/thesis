import { NextResponse } from "next/server";

import { resolveGiftPack } from "@/server/gifts/catalogue";

export const dynamic = "force-dynamic";

/**
 * One pack, by id. Public: a pack is presentation over a published thesis, and the unfunded preview
 * (whose pack id travels in the URL fragment, which the server never sees) needs it to render a pack
 * somebody built. Returns only what the preview shows.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = /^[a-z0-9-]{1,120}$/.test(id) ? await resolveGiftPack(id) : null;
  if (!pack) return NextResponse.json({ error: { code: "not_found", message: "No such pack." } }, { status: 404 });
  return NextResponse.json({ pack }, { headers: { "cache-control": "public, max-age=60" } });
}
