import { authed, err } from "@/server/api";
import { buildPack, buildPackSchema } from "@/server/gifts/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Build a pack: publish the sender's thesis and name it as a gift. The wallet comes from the session. */
export async function POST(request: Request) {
  const parsed = buildPackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err("invalid_draft", first?.message ?? "Some fields still need work.", 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return authed((wallet) => buildPack(wallet, parsed.data));
}
