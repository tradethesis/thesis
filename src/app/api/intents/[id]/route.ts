import { authed } from "@/server/api";
import { getIntent } from "@/server/execution/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The progress screen polls this, and this is what drives foreground reconciliation. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed((wallet) => getIntent(id, wallet));
}
