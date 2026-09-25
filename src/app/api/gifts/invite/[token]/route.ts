import { ok } from "@/server/api";
import { viewInvitation } from "@/server/gifts/service";

/** The invitation page's data. Public, and deliberately narrow: no IDs, no wallets. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await viewInvitation(token);
  return ok(view ? { status: "ok", invitation: view } : { status: "invalid_invitation" });
}
