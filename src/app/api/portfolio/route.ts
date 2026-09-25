import { getSession } from "@/server/session";
import { getPortfolio } from "@/server/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This wallet's portfolio: on-chain balances and purchases, at today's prices.
 *
 * The wallet is the session's and nobody else's, for the reason /api/purchases gives: an
 * endpoint that takes a wallet parameter hands anybody any address's holdings. 401 without a
 * session, so "not signed in" and "holds nothing" stay different screens. 502 when the chain
 * can't be read, because an unreadable wallet is not an empty one.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  try {
    return Response.json(await getPortfolio(session.wallet));
  } catch {
    return Response.json({ error: "unreadable" }, { status: 502 });
  }
}
