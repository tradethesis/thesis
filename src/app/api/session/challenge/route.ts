import { err, guard } from "@/server/api";
import { createChallenge } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { wallet } = (await request.json().catch(() => ({}))) as { wallet?: string };
  if (!wallet) return err("wallet_required", "A wallet address is required.");
  const url = new URL(request.url);
  return guard(() => createChallenge({ wallet, domain: url.host, uri: url.origin }));
}
