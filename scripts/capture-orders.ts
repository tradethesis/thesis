/**
 * Capture real /swap/v2/order responses as test fixtures.
 *
 * The order policy stands between a user's signature and their money, so its tests run
 * against responses Jupiter actually produced rather than shapes we imagined.
 *
 * Both shapes are captured, because they are not the same order. Without a `taker`,
 * Jupiter returns an AMM quote with otherAmountThreshold === outAmount and no expiry:
 * a price, not an executable order. Supply a taker and the RFQ maker quotes a firm,
 * gasless, expiring price instead. A preflight therefore does not predict the route the
 * user will actually sign, and the guard has to be built for that.
 */
import { writeFileSync } from "node:fs";
import { createOrder } from "../src/server/jupiter/client";
import { EQUITY_ASSETS, USDC_MINT } from "../src/server/assets/allowlist";

const SYMBOLS = ["COINx", "CRCLx", "HOODx"];
const LEG_BUDGET_RAW = 16_670_000n; // a third of a $50 basket

/** A throwaway address. Orders are assembled unsigned and never submitted. */
const PROBE_TAKER = "5hQmuDgjc8XZQDxL3u943GvamMkTfZXwF3iGL5Y3WrLg";

const pause = () => new Promise((r) => setTimeout(r, 400));

async function main() {
  const orders: Record<string, unknown> = {};

  for (const symbol of SYMBOLS) {
    const asset = EQUITY_ASSETS.find((a) => a.symbol === symbol)!;

    const preflight = await createOrder({
      inputMint: USDC_MINT,
      outputMint: asset.mint,
      amountRaw: LEG_BUDGET_RAW,
    });
    orders[`preflight_buy_${symbol}`] = preflight;
    await pause();

    const buy = await createOrder({
      inputMint: USDC_MINT,
      outputMint: asset.mint,
      amountRaw: LEG_BUDGET_RAW,
      taker: PROBE_TAKER,
    });
    orders[`buy_${symbol}`] = buy;
    await pause();

    const sell = await createOrder({
      inputMint: asset.mint,
      outputMint: USDC_MINT,
      amountRaw: BigInt(buy.outAmount),
      taker: PROBE_TAKER,
    });
    orders[`sell_${symbol}`] = sell;
    await pause();

    const line = (label: string, o: { router: string; swapType: string; slippageBps: number; gasless: boolean; outAmount: string; otherAmountThreshold: string }) =>
      `${label} ${o.router}/${o.swapType} slip=${o.slippageBps} gasless=${o.gasless} ` +
      `floor=${((Number(o.otherAmountThreshold) / Number(o.outAmount) - 1) * 100).toFixed(3)}%`;

    console.log(`${symbol}\n  ${line("preflight", preflight)}\n  ${line("buy      ", buy)}\n  ${line("sell     ", sell)}`);
  }

  const path = "src/lib/policy/__fixtures__/orders.json";
  writeFileSync(path, JSON.stringify({ capturedAt: new Date().toISOString(), taker: PROBE_TAKER, orders }, null, 2));
  console.log(`\nwrote ${path}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
