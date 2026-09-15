/**
 * Download the logo for every asset on the verified allowlist.
 *
 * Run with: pnpm tsx scripts/fetch-token-logos.ts
 *
 * The lookup is by mint and only by mint. Jupiter's search accepts a symbol, and searching
 * "NVDAx" returns four pump.fun clones alongside the real token — so this asks for the mint
 * address, takes only the row whose id matches it exactly, and then refuses to write
 * anything if the symbol Jupiter reports disagrees with the allowlist. A wrong logo beside
 * a holding is a wrong claim about what the buyer is getting, so a mismatch stops the
 * script rather than falling back to something plausible.
 *
 * Logos are downloaded and committed rather than hotlinked. Hotlinking would put a
 * third-party request on every card render, leak each reader's IP to the issuer's CDN, and
 * make the grid depend on someone else's uptime.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ALLOWLIST } from "../src/server/assets/allowlist";

const SEARCH = "https://lite-api.jup.ag/tokens/v2/search?query=";
const OUT = join(process.cwd(), "public", "tokens");
const TMP = join(process.cwd(), "output", "token-logos");
const SIZE = 64;

type JupToken = { id: string; symbol: string; name: string; icon?: string | null };

async function lookup(mint: string): Promise<JupToken | null> {
  const res = await fetch(SEARCH + encodeURIComponent(mint), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jupiter returned ${res.status} for ${mint}`);
  const rows = (await res.json()) as JupToken[];
  return rows.find((r) => r.id === mint) ?? null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const problems: string[] = [];
  const written: string[] = [];

  for (const asset of ALLOWLIST) {
    const row = await lookup(asset.mint);

    if (!row) {
      problems.push(`${asset.symbol}: Jupiter has no token at mint ${asset.mint}`);
      continue;
    }
    if (row.symbol !== asset.symbol) {
      problems.push(`${asset.symbol}: mint ${asset.mint} is "${row.symbol}" on Jupiter, not "${asset.symbol}"`);
      continue;
    }
    if (!row.icon) {
      problems.push(`${asset.symbol}: no icon published for ${asset.mint}`);
      continue;
    }

    const image = await fetch(row.icon);
    if (!image.ok) {
      problems.push(`${asset.symbol}: icon fetch returned ${image.status}`);
      continue;
    }

    const raw = join(TMP, `${asset.symbol}.src`);
    writeFileSync(raw, Buffer.from(await image.arrayBuffer()));

    // Square, small, and lossy — these are 26px tiles on a card. The alpha channel is kept
    // because several of the logos are transparent and sit on two different backgrounds.
    execFileSync("cwebp", ["-quiet", "-resize", String(SIZE), String(SIZE), "-q", "84", "-alpha_q", "100", raw, "-o", join(OUT, `${asset.symbol}.webp`)]);
    written.push(asset.symbol);
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`  wrote ${written.length}: ${written.join(", ")}`);
  if (problems.length) {
    console.error("\n  problems:");
    for (const p of problems) console.error(`    ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
