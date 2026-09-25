import { NextResponse } from "next/server";

import { EQUITY_ASSETS } from "@/server/assets/allowlist";

/** The stock tokens a pack can be built from: the enabled equity allowlist, symbol and company only. */
export async function GET() {
  const assets = EQUITY_ASSETS.filter((a) => a.enabled).map((a) => ({ symbol: a.symbol, company: a.company }));
  return NextResponse.json({ assets }, { headers: { "cache-control": "public, max-age=300" } });
}
