/**
 * Find xStocks that are not on the allowlist yet, and check whether they deserve to be.
 *
 *   pnpm tsx scripts/discover-xstocks.ts
 *
 * The allowlist was built by hand on 14 Sep from twelve mints and has not grown since, so
 * the catalogue can only express beliefs about nine companies. This is the safe way to
 * widen it: discovery proposes, verification disposes, and nothing is written automatically.
 *
 * Every candidate has to clear the same bar the existing entries did:
 *
 *   - the mint address begins "Xs" and the symbol ends "x";
 *   - the mint account is genuinely SPL Token-2022 with 8 decimals, read from the chain
 *     rather than taken from an index;
 *   - Jupiter's own record of that exact mint agrees on the symbol;
 *   - there is enough pool liquidity that a $25 leg is not moving the market;
 *   - a real two-way quote exists, because an asset that cannot be sold is not investable.
 *
 * Symbols are never the identity. Searching "NVDAx" on any Solana venue returns pump.fun
 * imitations alongside the real token, so the mint is what gets committed and the symbol is
 * only a label checked against it.
 */

import { ALLOWLIST } from "../src/server/assets/allowlist";

const JUP = "https://lite-api.jup.ag";
// Both, in order. The primary key can expire — it was returning 403 when this was
// written — and a discovery run that silently rejects every candidate because the RPC
// is dead looks exactly like a run where every candidate was bad.
const RPCS = [process.env.SOLANA_RPC_URL, process.env.SOLANA_RPC_FALLBACK_URL].filter(Boolean) as string[];
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Below this, a small leg starts moving the price it is quoted at. */
const MIN_LIQUIDITY_USD = 100_000;
/** One leg of a $75 basket. The size the round trip was originally measured at. */
const PROBE_USDC = 25_000_000n;

type Candidate = { id: string; symbol: string; name: string; decimals: number; liquidity: number };

async function jget<T>(path: string): Promise<T | null> {
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(`${JUP}${path}`, {
        headers: { "user-agent": "thesis-discover/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // fall through to the wait
    }
    await new Promise((r) => setTimeout(r, 1_500 * (i + 1)));
  }
  return null;
}

async function discover(): Promise<Map<string, Candidate>> {
  const found = new Map<string, Candidate>();
  // Several queries because the search returns a capped page; the union is wider than any
  // single query and is deduplicated by mint.
  const queries = ["xStock", "Backed", "tokenized stock", "QQQx", "GLDx", "MSTRx", "GMEx", "MCDx", "SPCXx", "VIDAx", "STRCx", "AAPLx"];
  for (const q of queries) {
    const rows = await jget<Candidate[]>(`/tokens/v2/search?query=${encodeURIComponent(q)}`);
    for (const t of rows ?? []) {
      if (t.id?.startsWith("Xs") && t.symbol?.endsWith("x")) found.set(t.id, t);
    }
  }
  return found;
}

async function mintAccount(mint: string): Promise<{ owner: string; decimals: number } | null> {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "getAccountInfo",
          params: [mint, { encoding: "jsonParsed" }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        result?: { value?: { owner?: string; data?: { parsed?: { info?: { decimals?: number } } } } };
      };
      const v = body.result?.value;
      if (!v?.owner || typeof v.data?.parsed?.info?.decimals !== "number") continue;
      return { owner: v.owner, decimals: v.data.parsed.info.decimals };
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}

async function twoWay(mint: string): Promise<{ ok: boolean; roundTripPct: number | null }> {
  const buy = await jget<{ outAmount?: string }>(
    `/swap/v1/quote?inputMint=${USDC}&outputMint=${mint}&amount=${PROBE_USDC}`,
  );
  if (!buy?.outAmount) return { ok: false, roundTripPct: null };

  const sell = await jget<{ outAmount?: string }>(
    `/swap/v1/quote?inputMint=${mint}&outputMint=${USDC}&amount=${buy.outAmount}`,
  );
  if (!sell?.outAmount) return { ok: false, roundTripPct: null };

  const back = BigInt(sell.outAmount);
  return { ok: true, roundTripPct: (Number(back - PROBE_USDC) / Number(PROBE_USDC)) * 100 };
}

async function main() {
  if (!RPCS.length) {
    console.error("  An RPC URL is required: the chain is what decides, not an index.");
    process.exit(1);
  }

  const known = new Set(ALLOWLIST.map((a) => a.mint));
  const candidates = [...(await discover()).values()].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  console.log(`  discovered ${candidates.length} xStock mints; ${candidates.filter((c) => !known.has(c.id)).length} not on the allowlist\n`);

  const passed: string[] = [];

  for (const c of candidates) {
    if (known.has(c.id)) continue;

    const problems: string[] = [];
    const onChain = await mintAccount(c.id);

    if (!onChain) problems.push("mint account unreadable");
    else {
      if (onChain.owner !== TOKEN_2022) problems.push(`token program ${onChain.owner.slice(0, 8)}…, expected Token-2022`);
      if (onChain.decimals !== 8) problems.push(`${onChain.decimals} decimals on chain, expected 8`);
      if (onChain.decimals !== c.decimals) problems.push(`chain says ${onChain.decimals} decimals, Jupiter says ${c.decimals}`);
    }
    if ((c.liquidity ?? 0) < MIN_LIQUIDITY_USD) {
      problems.push(`liquidity $${Math.round(c.liquidity ?? 0).toLocaleString("en-US")} is below $${MIN_LIQUIDITY_USD.toLocaleString("en-US")}`);
    }

    let round: number | null = null;
    if (!problems.length) {
      const trip = await twoWay(c.id);
      if (!trip.ok) problems.push("no two-way route at $25");
      else round = trip.roundTripPct;
    }

    if (problems.length) {
      console.log(`  REJECT  ${c.symbol.padEnd(8)} ${c.name}`);
      for (const p of problems) console.log(`          ${p}`);
      continue;
    }

    console.log(`  PASS    ${c.symbol.padEnd(8)} ${c.name.padEnd(28)} round trip ${round!.toFixed(2)}%  liq $${Math.round(c.liquidity).toLocaleString("en-US")}`);
    passed.push(`  xstock("${c.symbol}", "${c.name.replace(/ xStock$/, "")}", "${c.symbol.replace(/x$/, "")}", "${c.id}", false),`);
  }

  if (passed.length) {
    console.log(`\n  ${passed.length} candidate(s) cleared every check. Paste into EQUITY_ASSETS:\n`);
    console.log(passed.join("\n"));
    console.log(`\n  They are emitted disabled. Enabling one is an editorial decision — whether the
  underlying is something this product should help somebody buy — and it is not a
  decision a discovery script gets to make.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
