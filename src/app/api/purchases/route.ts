import { getSession } from "@/server/session";
import { listPurchases } from "@/server/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This wallet's purchase history.
 *
 * The wallet is read from the authenticated session cookie and from nowhere else. There is
 * deliberately no wallet parameter: an endpoint that accepts one is an endpoint that hands
 * anybody the trading history of any address they can type, and adding the parameter "just
 * for convenience" is how that ships.
 *
 * 401 when there is no session, rather than an empty list, so the client can tell "not
 * signed in" from "signed in and has bought nothing" — those need different screens.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  return Response.json({ wallet: session.wallet, purchases: await listPurchases(session.wallet) });
}
