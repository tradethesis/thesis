/**
 * Check top Solana assets for inclusion on the allowlist.
 *
 *   pnpm tsx scripts/discover-crypto.ts
 *
 * The catalogue can only express beliefs about tokenized equities, which rules out every
 * thesis whose natural expression is an onchain asset. These are a different shape from the
 * xStocks and the checks have to change with them: classic SPL Token rather than Token-2022,
 * decimals that vary by asset, and no "Xs" prefix to lean on.
 *
 * What replaces those checks is authority. A wrapped or staked asset has somebody standing
 * behind it, and that is the disclosure a buyer needs:
 *
 *   - a freeze authority means an issuer can freeze the holding in place;
 *   - a mint authority means somebody can create more, which is how wrapping and liquid
 *     staking work and is not by itself a fault;
 *   - neither means there is nothing to disclose beyond market risk.
 *
 * Both are read from the chain here, and both are printed, because an asset whose issuer
 * powers are unknown has no business on a list this product buys from.
 */

import { ALLOWLIST } from "../src/server/assets/allowlist";

const JUP = "https://lite-api.jup.ag";
const RPCS = [process.env.SOLANA_RPC_URL, process.env.SOLANA_RPC_FALLBACK_URL].filter(Boolean) as string[];
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Deep enough that a $25 leg is not the trade that moves it. */
const MIN_LIQUIDITY_USD = 1_000_000;
const PROBE_USDC = 25_000_000n;

/**
 * Candidates by mint, never by ticker.
 *
 * Every one of these symbols has imitations on Solana, several with real liquidity. The
 * mint is the identity; the symbol below is a label this script checks against it, and a
 * disagreement is a rejection rather than a warning.
 */
const CANDIDATES: { symbol: string; name: string; mint: string }[] = [
  { symbol: "SOL", name: "Solana", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "JitoSOL", name: "Jito staked SOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn" },
  { symbol: "cbBTC", name: "Coinbase wrapped BTC", mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij" },
  { symbol: "WBTC", name: "Wrapped BTC (Portal)", mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh" },
  { symbol: "ETH", name: "Wrapped ETH (Portal)", mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs" },
  { symbol: "JUP", name: "Jupiter", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "Bonk", name: "Bonk", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "JLP", name: "Jupiter liquidity provider token", mint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4" },
  { symbol: "PYTH", name: "Pyth Network", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
  { symbol: "RAY", name: "Raydium", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
];

type JupToken = { id: string; symbol: string; decimals: number; liquidity?: number };

async function jget<T>(path: string): Promise<T | null> {
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(`${JUP}${path}`, { headers: { "user-agent": "thesis-discover/1.0" }, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // fall through
    }
    await new Promise((r) => setTimeout(r, 1_200 * (i + 1)));
  }
  return null;
}

type MintInfo = { owner: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null };

async function mintAccount(mint: string): Promise<MintInfo | null> {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        result?: { value?: { owner?: string; data?: { parsed?: { info?: { decimals?: number; mintAuthority?: string | null; freezeAuthority?: string | null } } } } };
      };
      const v = body.result?.value;
      const info = v?.data?.parsed?.info;
      if (!v?.owner || typeof info?.decimals !== "number") continue;
      return {
        owner: v.owner,
        decimals: info.decimals,
        mintAuthority: info.mintAuthority ?? null,
        freezeAuthority: info.freezeAuthority ?? null,
      };
    } catch {
      // next endpoint
    }
  }
  return null;
}

async function twoWay(mint: string): Promise<number | null> {
  const buy = await jget<{ outAmount?: string }>(`/swap/v1/quote?inputMint=${USDC}&outputMint=${mint}&amount=${PROBE_USDC}`);
  if (!buy?.outAmount) return null;
  const sell = await jget<{ outAmount?: string }>(`/swap/v1/quote?inputMint=${mint}&outputMint=${USDC}&amount=${buy.outAmount}`);
  if (!sell?.outAmount) return null;
  return (Number(BigInt(sell.outAmount) - PROBE_USDC) / Number(PROBE_USDC)) * 100;
}

function powers(m: MintInfo): string {
  const parts: string[] = [];
  if (m.freezeAuthority) parts.push(`freeze authority ${m.freezeAuthority.slice(0, 6)}… can freeze this token in any wallet`);
  if (m.mintAuthority) parts.push(`mint authority ${m.mintAuthority.slice(0, 6)}… can issue more`);
  return parts.length ? parts.join("; ") : "No mint or freeze authority. Market risk only.";
}

async function main() {
  if (!RPCS.length) {
    console.error("  An RPC URL is required: the chain decides, not an index.");
    process.exit(1);
  }

  const known = new Set(ALLOWLIST.map((a) => a.mint));
  const passed: string[] = [];

  for (const c of CANDIDATES) {
    if (known.has(c.mint)) {
      console.log(`  skip    ${c.symbol.padEnd(9)} already on the allowlist`);
      continue;
    }

    const problems: string[] = [];
    const chain = await mintAccount(c.mint);
    const jup = await jget<JupToken[]>(`/tokens/v2/search?query=${c.mint}`);
    const row = (jup ?? []).find((t) => t.id === c.mint);

    if (!chain) problems.push("mint account unreadable");
    else if (chain.owner !== TOKEN_PROGRAM && chain.owner !== TOKEN_2022) {
      problems.push(`owner ${chain.owner.slice(0, 8)}… is neither token program`);
    }
    if (!row) problems.push("Jupiter has no token at this mint");
    else {
      // Exact, not case-insensitive. scripts/fetch-token-logos.ts compares exactly and
      // refused to save a logo for two assets this check had waved through, which is two
      // checks disagreeing about identity — the stricter one is the one to keep.
      if (row.symbol !== c.symbol) problems.push(`Jupiter calls this mint "${row.symbol}", not "${c.symbol}"`);
      if (chain && row.decimals !== chain.decimals) problems.push(`chain says ${chain.decimals} decimals, Jupiter says ${row.decimals}`);
      if ((row.liquidity ?? 0) < MIN_LIQUIDITY_USD) {
        problems.push(`liquidity $${Math.round(row.liquidity ?? 0).toLocaleString("en-US")} below $${MIN_LIQUIDITY_USD.toLocaleString("en-US")}`);
      }
    }

    let round: number | null = null;
    if (!problems.length) {
      round = await twoWay(c.mint);
      if (round === null) problems.push("no two-way route at $25");
    }

    if (problems.length) {
      console.log(`  REJECT  ${c.symbol.padEnd(9)} ${c.name}`);
      for (const p of problems) console.log(`          ${p}`);
      continue;
    }

    const program = chain!.owner === TOKEN_2022 ? "TOKEN_2022_PROGRAM" : "TOKEN_PROGRAM";
    console.log(`  PASS    ${c.symbol.padEnd(9)} ${c.name.padEnd(30)} round trip ${round!.toFixed(3)}%  ${chain!.decimals}dp`);
    console.log(`          ${powers(chain!)}`);
    passed.push(
      `  crypto("${c.symbol}", "${c.name}", "${c.mint}", ${chain!.decimals}, ${program},\n` +
      `    "${powers(chain!).replace(/"/g, '\\"')}"),`,
    );
  }

  if (passed.length) {
    console.log(`\n  ${passed.length} passed. Each needs a crypto() helper entry in EQUITY_ASSETS' sibling list:\n`);
    console.log(passed.join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
