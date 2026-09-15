import { ok } from "@/server/api";
import { endSession, getSession } from "@/server/session";
import { env, executionModeForWallet } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return ok(
    session
      ? { wallet: session.wallet, executionMode: executionModeForWallet(session.wallet), globalMode: env.executionMode() }
      : { wallet: null, executionMode: "simulation", globalMode: env.executionMode() },
  );
}

export async function DELETE() {
  await endSession();
  return ok({ wallet: null });
}
