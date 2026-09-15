import { authed, err } from "@/server/api";
import { executeLeg } from "@/server/execution/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; legId: string }> }) {
  const { id, legId } = await params;
  const { signedTransaction } = (await request.json().catch(() => ({}))) as { signedTransaction?: string };
  if (!signedTransaction) return err("incomplete", "signedTransaction is required.");
  return authed((wallet) => executeLeg(id, legId, wallet, signedTransaction));
}
