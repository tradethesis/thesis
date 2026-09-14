import { ALLOWLIST, TOKEN_2022_PROGRAM, USDC_MINT, type AllowlistEntry } from "./allowlist";
import { getParsedMint } from "../solana/rpc";
import { createOrder, searchTokens } from "../jupiter/client";

/**
 * Verify every allowlisted mint against the chain and against Jupiter.
 *
 * Ported from ~/candlewick/world.py's verify_mints(), which exists because two mints
 * were guessed wrong on a first build and had to be corrected from an explorer. The
 * check runs at seed time and in CI; it refuses rather than warns.
 */

export type MintCheck = {
  symbol: string;
  mint: string;
  ok: boolean;
  problems: string[];
  onChain?: {
    owner: string;
    decimals: number;
    extensions: string[];
    scaledUiMultiplier: string | null;
    accountStateFrozenByDefault: boolean;
    hasTransferHook: boolean;
    permanentDelegate: string | null;
    paused: boolean | null;
  };
  routeOk?: boolean;
};

const PROBE_AMOUNT_RAW = 10_000_000n; // $10 of USDC

function effectiveMultiplier(state: Record<string, unknown> | undefined): string | null {
  if (!state) return null;
  const effective = Number(state.newMultiplierEffectiveTimestamp ?? 0);
  const now = Date.now() / 1000;
  const chosen = now >= effective ? state.newMultiplier : state.multiplier;
  return typeof chosen === "string" ? chosen : null;
}

export async function checkMint(asset: AllowlistEntry, probeRoutes: boolean): Promise<MintCheck> {
  const problems: string[] = [];
  const check: MintCheck = { symbol: asset.symbol, mint: asset.mint, ok: false, problems };

  let mint;
  try {
    mint = await getParsedMint(asset.mint);
  } catch (error) {
    problems.push(`mint account read failed: ${(error as Error).message}`);
    return check;
  }
  if (!mint) {
    problems.push("mint account does not exist on chain");
    return check;
  }

  const extensions = mint.extensions.map((e) => e.extension);
  const byName = new Map(mint.extensions.map((e) => [e.extension, e.state]));
  const accountState = byName.get("defaultAccountState") as { accountState?: string } | undefined;
  const transferHook = byName.get("transferHook") as { programId?: string | null } | undefined;
  const permanentDelegate = byName.get("permanentDelegate") as { delegate?: string } | undefined;
  const pausable = byName.get("pausableConfig") as { paused?: boolean } | undefined;

  check.onChain = {
    owner: mint.owner,
    decimals: mint.decimals,
    extensions,
    scaledUiMultiplier: effectiveMultiplier(byName.get("scaledUiAmountConfig") as Record<string, unknown> | undefined),
    accountStateFrozenByDefault: accountState?.accountState === "frozen",
    hasTransferHook: Boolean(transferHook?.programId),
    permanentDelegate: permanentDelegate?.delegate ?? null,
    paused: pausable?.paused ?? null,
  };

  if (mint.owner !== asset.tokenProgram) {
    problems.push(`token program is ${mint.owner}, allowlist says ${asset.tokenProgram}`);
  }
  if (mint.decimals !== asset.decimals) {
    problems.push(`decimals are ${mint.decimals}, allowlist says ${asset.decimals}`);
  }
  if (asset.tokenProgram === TOKEN_2022_PROGRAM && !asset.mint.startsWith("Xs")) {
    problems.push("equity token mint does not start with Xs");
  }
  if (check.onChain.accountStateFrozenByDefault) {
    problems.push("defaultAccountState is frozen: a new buyer's token account would be unusable");
  }
  if (check.onChain.hasTransferHook) {
    problems.push(`a transfer hook is set (${transferHook?.programId}): transfers can be blocked by a third program`);
  }
  if (check.onChain.paused === true) {
    problems.push("the issuer has paused transfers for this mint");
  }

  // Jupiter must know the mint, and its record must agree with ours. This is a
  // cross-check on data we already trust, never a lookup.
  const found = (await searchTokens(asset.mint)).find((t) => t.id === asset.mint);
  if (!found) {
    problems.push("Jupiter's token index does not contain this mint");
  } else if (found.decimals !== asset.decimals) {
    problems.push(`Jupiter reports ${found.decimals} decimals, allowlist says ${asset.decimals}`);
  }

  if (probeRoutes && asset.mint !== USDC_MINT) {
    try {
      const buy = await createOrder({ inputMint: USDC_MINT, outputMint: asset.mint, amountRaw: PROBE_AMOUNT_RAW });
      const out = BigInt(buy.outAmount ?? "0");
      if (out <= 0n) {
        problems.push("no buy route");
      } else {
        const sell = await createOrder({ inputMint: asset.mint, outputMint: USDC_MINT, amountRaw: out });
        if (BigInt(sell.outAmount ?? "0") <= 0n) problems.push("no sell route");
        check.routeOk = problems.length === 0;
      }
    } catch (error) {
      problems.push(`route probe failed: ${(error as Error).message}`);
    }
  }

  check.ok = problems.length === 0;
  return check;
}

export async function verifyAllowlist(options: { probeRoutes?: boolean } = {}): Promise<MintCheck[]> {
  const results: MintCheck[] = [];
  for (const asset of ALLOWLIST) {
    results.push(await checkMint(asset, options.probeRoutes ?? false));
    // Space out keyed calls; the quota exists to be spent on execution.
    if (options.probeRoutes) await new Promise((r) => setTimeout(r, 350));
  }
  return results;
}

async function main() {
  const probeRoutes = !process.argv.includes("--no-routes");
  const results = await verifyAllowlist({ probeRoutes });

  for (const r of results) {
    const mark = r.ok ? "ok  " : "FAIL";
    const scaled = r.onChain?.scaledUiMultiplier;
    const extra = scaled && scaled !== "1" ? ` multiplier=${scaled}` : "";
    console.log(`${mark} ${r.symbol.padEnd(7)} ${r.mint}${extra}`);
    for (const p of r.problems) console.log(`       - ${p}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verified`);
  if (failed.length) process.exit(1);
}

if (process.argv[1]?.endsWith("verify.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
