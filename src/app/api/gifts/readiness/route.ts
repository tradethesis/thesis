import { ok } from "@/server/api";
import { readiness } from "@/server/gifts/providers";

/**
 * Which parts of live gifting this deployment can do. Variable names only, never values — the
 * page uses this to show an honest "not available here" instead of a button that fails.
 */
export async function GET() {
  return ok(readiness());
}
