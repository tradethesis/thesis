import { NextResponse } from "next/server";
import { verifyUserSignature } from "@/server/execution/verifySignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check a signed transaction and stop.
 *
 * This route deliberately has no path to /swap/v2/execute. It is the proof that the wallet
 * signed our exact message in its own slot, and nothing more.
 *
 * In the real execute route the unsigned message is read from the database row the server
 * wrote, not accepted from the caller. Here the caller supplies both halves, which proves
 * the wallet behaved but not that the server authored the order — a distinction worth
 * keeping clear, since it is the whole reason the real route stores the message hash
 * before the transaction ever leaves the server.
 */
export async function POST(request: Request) {
  let body: { unsignedB64?: string; signedB64?: string; wallet?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { unsignedB64, signedB64, wallet } = body;
  if (!unsignedB64 || !signedB64 || !wallet) {
    return NextResponse.json({ error: "unsignedB64, signedB64 and wallet are required" }, { status: 400 });
  }

  try {
    const verdict = verifyUserSignature({ unsignedB64, signedB64, wallet });
    // A 200 here means the check ran, not that it passed. Log which, so a run leaves
    // evidence behind rather than only a status code.
    console.log(
      verdict.ok
        ? `[signing-check] PASS wallet=${wallet} slot=${verdict.signerIndex} derivable=${verdict.signatureDerivable} takerSig=${verdict.takerSignature}`
        : `[signing-check] FAIL wallet=${wallet} code=${verdict.code} ${verdict.message}`,
    );
    return NextResponse.json({ verdict });
  } catch (error) {
    console.log(`[signing-check] ERROR wallet=${wallet} ${(error as Error).message}`);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
