import { authed } from "@/server/api";
import { cancelIntent } from "@/server/execution/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed((wallet) => cancelIntent(id, wallet));
}
