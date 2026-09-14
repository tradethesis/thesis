/**
 * How much does a leg cost at each size?
 *
 * PRD Screen C: "The minimum basket amount is computed from current per-leg trade
 * minimums and estimated costs. Do not promise a universal $1 entry price." This is that
 * computation. Jupiter's top-level feeBps on an RFQ order came back at 10 bps on a $50
 * leg and 101 bps on a $16.67 leg, so the cost is clearly not linear and the floor has to
 * be measured rather than assumed.
 */
import { createOrder } from "../src/server/jupiter/client";
import { EQUITY_ASSETS, USDC_MINT } from "../src/server/assets/allowlist";

const SIZES_USD = [5, 10, 16.67, 25, 50, 100, 250];
const SYMBOLS = ["COINx", "NVDAx"];

async function main() {
  const taker = "5hQmuDgjc8XZQDxL3u943GvamMkTfZXwF3iGL5Y3WrLg";
  console.log("sym     leg$    router   feeBps  impact%   inUsd    outUsd   implied cost%");
  for (const symbol of SYMBOLS) {
    const asset = EQUITY_ASSETS.find((a) => a.symbol === symbol)!;
    for (const usd of SIZES_USD) {
      const amountRaw = BigInt(Math.round(usd * 1e6));
      try {
        const o = await createOrder({ inputMint: USDC_MINT, outputMint: asset.mint, amountRaw, taker });
        const inUsd = o.inUsdValue ?? 0;
        const outUsd = o.outUsdValue ?? 0;
        const cost = inUsd ? ((inUsd - outUsd) / inUsd) * 100 : NaN;
        console.log(
          `${symbol.padEnd(7)} ${String(usd).padStart(6)}  ${o.router.padEnd(8)} ` +
            `${String(o.feeBps).padStart(6)}  ${(Number(o.priceImpactPct) * 100).toFixed(3).padStart(7)}  ` +
            `${inUsd.toFixed(4).padStart(8)} ${outUsd.toFixed(4).padStart(9)}  ${cost.toFixed(3).padStart(8)}`,
        );
      } catch (e) {
        console.log(`${symbol.padEnd(7)} ${String(usd).padStart(6)}  ERROR ${(e as Error).message.slice(0, 70)}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
