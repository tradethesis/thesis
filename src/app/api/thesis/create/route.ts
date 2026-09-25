import { authed, err, guard } from "@/server/api";
import { draftSchema } from "@/lib/thesis-draft";
import { createThesis, listMyTheses } from "@/server/content/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a thesis.
 *
 * The wallet comes from the session and never from the body, for the same reason
 * `/api/purchases` refuses a wallet parameter: this one decides who a token pays.
 *
 * Publishes immediately. The caller then launches the token against the slug this returns —
 * two steps rather than one, because a launch needs a signature and a publish does not, and
 * a thesis that exists without its token is recoverable while the reverse is not.
 */
export async function POST(request: Request) {
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err("invalid_draft", first?.message ?? "Some fields still need work.", 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return authed((wallet) => createThesis({ wallet, draft: parsed.data }));
}

/** What this wallet has written. Used by My theses to show a submission's state. */
export async function GET() {
  return guard(async () => {
    const { getSession } = await import("@/server/session");
    const session = await getSession();
    return session ? { theses: await listMyTheses(session.wallet) } : { theses: [] };
  });
}
