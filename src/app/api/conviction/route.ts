import { getSession } from "@/server/session";
import { clearSide, isValidOwner, scoredForOwner, takeSide, type Owner } from "@/server/conviction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIDES = ["backing", "doubting"] as const;

/**
 * Who is asking, decided here and nowhere else.
 *
 * A signed-in wallet wins; otherwise the anonymous id the browser generated, sent as a
 * header. The request body is never consulted for identity — an endpoint that lets a caller
 * name an owner is an endpoint that writes to and reads from anybody's record, and that is
 * always introduced as a convenience.
 *
 * The anonymous path is the whole point of this feature: every other action in this app
 * requires a SIWS session and Phantom specifically, which leaves a visitor without that
 * extension unable to do anything at all.
 */
async function ownerFor(request: Request): Promise<Owner | null> {
  const session = await getSession();
  if (session) return { kind: "wallet", key: session.wallet };

  const anon = request.headers.get("x-thesis-anon");
  const candidate: Owner = { kind: "anon", key: anon ?? "" };
  return isValidOwner(candidate) ? candidate : null;
}

export async function GET(request: Request) {
  const owner = await ownerFor(request);
  if (!owner) return Response.json({ convictions: [] });
  return Response.json({ owner: owner.kind, convictions: await scoredForOwner(owner) });
}

export async function POST(request: Request) {
  const owner = await ownerFor(request);
  if (!owner) {
    return Response.json({ error: "no_identity", message: "Send an anonymous id or sign in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { thesisId, side } = (body ?? {}) as Record<string, unknown>;
  if (typeof thesisId !== "string" || !UUID.test(thesisId)) {
    return Response.json({ error: "bad_request", message: "thesisId must be a uuid." }, { status: 400 });
  }
  if (typeof side !== "string" || !SIDES.includes(side as (typeof SIDES)[number])) {
    return Response.json({ error: "bad_request", message: "side must be backing or doubting." }, { status: 400 });
  }

  const stored = await takeSide(owner, thesisId, side as (typeof SIDES)[number]);
  if (!stored) {
    // Not found and not published are the same answer on purpose: a probe should not be
    // able to tell an unpublished thesis from one that does not exist.
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({ conviction: stored });
}

export async function DELETE(request: Request) {
  const owner = await ownerFor(request);
  if (!owner) return new Response(null, { status: 401 });

  const thesisId = new URL(request.url).searchParams.get("thesisId") ?? "";
  if (!UUID.test(thesisId)) return Response.json({ error: "bad_request" }, { status: 400 });

  await clearSide(owner, thesisId);
  return new Response(null, { status: 204 });
}
