import { env, executionModeForWallet } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this deployment can spend real money, answered by the code that decides it.
 *
 * Exists because "is live execution armed" was, for a while, genuinely unknowable from
 * outside. EXECUTION_MODE has to equal the string "live" exactly, and a value written with
 * a trailing newline — which `echo` adds and the dashboard will happily store — fails that
 * comparison and falls back to simulation. Stored as a secret, it also cannot be read back.
 * So a deployment could sit in simulation while every dashboard said "live".
 *
 * The answer here comes from calling executionModeForWallet itself rather than
 * re-reading the variable, so this cannot drift from the gate it is reporting on.
 *
 * Behind the cron secret. It is only a mode, but it tells an attacker whether this
 * deployment is worth attention, and there is no reason for that to be public.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret()}`) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }

  const wallets = env.liveExecutionWallets();
  // A wallet that is on the allowlist, asked of the real gate. If this says "simulation"
  // while the switch is supposedly on, the switch is not on.
  const [sample] = [...wallets];

  return Response.json({
    globalMode: env.executionMode(),
    allowlistedWallets: wallets.size,
    // The decisive answer: what an allowlisted wallet would actually get.
    armedForAllowlistedWallet: sample ? executionModeForWallet(sample) === "live" : false,
  });
}
