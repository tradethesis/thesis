import { NextResponse } from "next/server";
import { createOrder } from "@/server/jupiter/client";
import { EQUITY_ASSETS, USDC_MINT } from "@/server/assets/allowlist";
import { evaluateOrder } from "@/lib/policy/orderPolicy";
import { splitTransaction, base64ToBytes, isEmptySignature } from "@/lib/wallet/transaction";
import { hashMessage } from "@/server/execution/verifySignature";
import { jsonSafe } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Assemble one real mainnet order for a wallet, run the policy guard over it, and hand
 * back the unsigned transaction.
 *
 * Nothing here is broadcast. This exists so the wallet path — connect, deserialize, sign
 * the right slot, leave the message alone — can be proved against a real Jupiter
 * transaction without spending anything.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet");
  const symbol = url.searchParams.get("symbol") ?? "NVDAx";
  const usd = Number(url.searchParams.get("usd") ?? "25");

  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });

  const asset = EQUITY_ASSETS.find((a) => a.symbol === symbol);
  if (!asset) return NextResponse.json({ error: `${symbol} is not on the allowlist` }, { status: 400 });

  const amountRaw = BigInt(Math.round(usd * 1e6));

  let order;
  try {
    order = await createOrder({
      inputMint: USDC_MINT,
      outputMint: asset.mint,
      amountRaw,
      taker: wallet,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }

  const verdict = evaluateOrder(order, {
    plannedInRaw: amountRaw,
    expectedInputMint: USDC_MINT,
    expectedOutputMint: asset.mint,
    expectedTaker: wallet,
    requireExecutable: true,
    nowMs: Date.now(),
  });

  let signers: { index: number; address: string; isUser: boolean; empty: boolean }[] = [];
  let messageHash: string | null = null;

  if (order.transaction) {
    const parts = splitTransaction(base64ToBytes(order.transaction));
    messageHash = hashMessage(parts.message);
    // Static account keys begin after the version byte and the 3-byte header.
    const msg = parts.message;
    const versioned = (msg[0] & 0x80) !== 0;
    let offset = (versioned ? 1 : 0) + 3;
    const keyCount = msg[offset];
    offset += 1;
    const { default: bs58 } = await import("bs58");
    signers = parts.signatures.map((sig, index) => {
      const key = bs58.encode(msg.slice(offset + index * 32, offset + (index + 1) * 32));
      return { index, address: key, isUser: key === wallet, empty: isEmptySignature(sig) };
    });
    void keyCount;
  }

  return NextResponse.json(
    jsonSafe({
    asset: { symbol: asset.symbol, company: asset.company, mint: asset.mint },
    input: { usd, amountRaw: amountRaw.toString(), mint: USDC_MINT },
    order: {
      requestId: order.requestId,
      router: order.router,
      swapType: order.swapType,
      gasless: order.gasless,
      feeBps: order.feeBps,
      platformFee: order.platformFee,
      outAmount: order.outAmount,
      otherAmountThreshold: order.otherAmountThreshold,
      expireAt: order.expireAt,
      rentFeeLamports: order.rentFeeLamports,
      rentFeePayer: order.rentFeePayer,
      errorCode: order.errorCode,
      errorMessage: order.errorMessage,
    },
    verdict,
    signers,
    messageHash,
    unsignedB64: order.transaction,
    }),
  );
}
