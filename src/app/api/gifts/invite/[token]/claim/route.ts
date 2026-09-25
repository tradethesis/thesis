import { err, guard } from "@/server/api";
import { body, idempotencyKey } from "@/server/gifts/http";
import { verifyIdentity } from "@/server/gifts/providers";
import { reserveClaim } from "@/server/gifts/service";

/**
 * Reserve a gift for the verified recipient. The only identity accepted is what the provider
 * verifies from the token — `verifyIdentity`, the real one; there is no other implementation this
 * route can reach. A handle, subject or wallet in the body would be ignored, so none is read.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const b = await body<{ identityToken?: unknown; declaration?: { country?: unknown; attested?: unknown } }>(request);
  if (typeof b?.identityToken !== "string" || b.identityToken.length > 4_000) return err("identity_required", "Sign in with X to open this gift.", 401);
  const identityToken = b.identityToken;
  // The declaration is the recipient's own statement; the country is the platform's reading of the
  // connection. Neither comes from anything else in the body.
  const d = b.declaration;
  const declaration = d && typeof d.country === "string" && typeof d.attested === "boolean" ? { country: d.country, attested: d.attested } : null;
  const ipCountry = request.headers.get("x-vercel-ip-country");
  return guard(() => reserveClaim({ inviteToken: token, identityToken, verify: verifyIdentity, idempotencyKey: key, declaration, ipCountry }));
}
