import { err, ok } from "@/server/api";
import { verifyChallenge } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    wallet?: string;
    signature?: string;
    signedMessage?: string;
  };
  if (!body.wallet || !body.signature || !body.signedMessage) {
    return err("incomplete", "wallet, signature and signedMessage are all required.");
  }
  const url = new URL(request.url);
  const result = await verifyChallenge({
    wallet: body.wallet,
    signature: body.signature,
    signedMessage: body.signedMessage,
    domain: url.host,
  });
  // A refused sign-in is the caller's problem, not ours. 401, with the reason, rather than
  // a 500 that reads like the server broke.
  return result.ok ? ok(result) : err("sign_in_refused", result.reason, 401);
}
