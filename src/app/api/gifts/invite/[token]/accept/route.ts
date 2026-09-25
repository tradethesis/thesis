import { err, guard } from "@/server/api";
import { body, idempotencyKey } from "@/server/gifts/http";
import { acceptInvitation } from "@/server/gifts/service";

/**
 * The recipient accepts a gift that is waiting for them, by signing in with the X account it names.
 * Only the verified identity token decides; a handle, subject or wallet in the body is never read.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const b = await body<{ identityToken?: unknown }>(request);
  if (typeof b?.identityToken !== "string" || b.identityToken.length > 4_000) return err("identity_required", "Sign in with X to accept this gift.", 401);
  const identityToken = b.identityToken;
  return guard(() => acceptInvitation({ token, identityToken, idempotencyKey: key }));
}
