import { authed } from "@/server/api";
import { simulateLeg } from "@/server/execution/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; legId: string }> }) {
  const { id, legId } = await params;
  return authed((wallet) => simulateLeg(id, legId, wallet));
}
