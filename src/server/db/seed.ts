import { eq } from "drizzle-orm";
import { db } from "./client";
import { asset } from "./schema";
import { ALLOWLIST, CRYPTO_ASSETS, PRESTOCKS_ASSETS, USDC_MINT } from "../assets/allowlist";
import { checkMint } from "../assets/verify";

/**
 * Seed the asset table from the allowlist, enriched with what the chain actually says.
 *
 * The chain is the source of truth for decimals, token program, and extensions — the
 * allowlist is the source of truth for identity. If they disagree the seed refuses,
 * because a mismatch means either the allowlist is wrong or the mint changed under us,
 * and both are reasons to stop rather than to continue with a warning.
 */
async function main() {
  const now = new Date();
  let seeded = 0;

  for (const entry of ALLOWLIST) {
    const check = await checkMint(entry, false);
    if (!check.ok) {
      console.error(`refusing to seed ${entry.symbol}:`);
      for (const p of check.problems) console.error(`  - ${p}`);
      process.exit(1);
    }

    const onChain = check.onChain!;
    const row = {
      chain: "solana",
      mint: entry.mint,
      // Not everything on the allowlist is a tokenized equity any more. The kind drives
      // the asset_equity_mint_prefix constraint, which requires an "Xs" mint for
      // equity_token and correctly refuses a crypto mint labelled as one.
      kind:
        entry.mint === USDC_MINT
          ? "quote_currency"
          : CRYPTO_ASSETS.some((c) => c.mint === entry.mint)
            ? "crypto"
            : PRESTOCKS_ASSETS.some((pre) => pre.mint === entry.mint)
              ? // Its own kind, not equity_token. A pre-IPO token is not a listed share:
                // there is no public market price behind it, and the asset_equity_mint_prefix
                // CHECK exists precisely so nothing that is not an xStock can claim to be one.
                "pre_ipo_token"
              : "equity_token",
      tokenProgram: onChain.owner,
      decimals: onChain.decimals,
      symbol: entry.symbol,
      company: entry.company,
      underlying: entry.underlying,
      issuer: entry.issuer,
      issuerPowers: entry.issuerPowers,
      termsUrl: entry.termsUrl,
      extensions: onChain.extensions,
      supportsScaledUi: onChain.extensions.includes("scaledUiAmountConfig"),
      enabled: entry.enabled,
      network: "mainnet",
      verificationSource: "chain getAccountInfo + jupiter token index",
      verifiedAt: now,
    };

    const existing = await db.select({ id: asset.id }).from(asset).where(eq(asset.mint, entry.mint));
    if (existing.length) {
      await db.update(asset).set(row).where(eq(asset.mint, entry.mint));
    } else {
      await db.insert(asset).values(row);
    }
    seeded += 1;
    const scaled = onChain.scaledUiMultiplier;
    console.log(
      `  ${entry.symbol.padEnd(7)} ${entry.enabled ? "enabled " : "reserved"} ` +
        `${onChain.decimals}dp${scaled && scaled !== "1" ? ` rebase=${scaled}` : ""}`,
    );
  }

  console.log(`\nseeded ${seeded} assets`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
