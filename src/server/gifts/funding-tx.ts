import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

import { USDC_MINT } from "../assets/allowlist";
import { rpc } from "../solana/rpc";

/**
 * The funding transaction, unsigned.
 *
 * The server builds it; the sender's wallet signs it and is the only party that broadcasts it —
 * the convention documented in src/lib/wallet/phantom.ts for every non-Jupiter transaction. The
 * server never holds a key and never calls sendTransaction; rpc.ts does not even allow it.
 *
 * Three instructions, all standard programs, nothing custom:
 *
 *   1. Create the recipient's USDC account if it does not exist (idempotent; the sender pays rent).
 *   2. TransferChecked the exact gift amount from the sender's USDC account to it.
 *   3. Transfer a fixed SOL allowance so the recipient can pay fees and token-account rent when they
 *      open the pack. Without it an embedded wallet with zero SOL cannot sign anything at all.
 */

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USDC = new PublicKey(USDC_MINT);
const USDC_DECIMALS = 6;

/**
 * 0.01 SOL. Opening a three-holding pack creates up to three token accounts (about 0.00204 SOL of
 * rent each, ~0.0061 total) and signs a handful of swaps. The rest is headroom for priority fees.
 * Stated to the sender before signing; it is part of what they give.
 */
export const SOL_ALLOWANCE_LAMPORTS = 10_000_000n;

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

function createAtaIdempotent(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  });
}

function transferChecked(source: PublicKey, mint: PublicKey, dest: PublicKey, owner: PublicKey, amount: bigint, decimals: number): TransactionInstruction {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0); // TransferChecked
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(decimals, 9);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** Pure: the instructions, with no network. Tested directly. */
export function fundingInstructions(args: { sender: string; destination: string; amountRaw: bigint; solLamports: bigint }): TransactionInstruction[] {
  const sender = new PublicKey(args.sender);
  const destination = new PublicKey(args.destination);
  const from = associatedTokenAddress(sender, USDC);
  const to = associatedTokenAddress(destination, USDC);
  return [
    createAtaIdempotent(sender, to, destination, USDC),
    transferChecked(from, USDC, to, sender, args.amountRaw, USDC_DECIMALS),
    SystemProgram.transfer({ fromPubkey: sender, toPubkey: destination, lamports: args.solLamports }),
  ];
}

export async function buildFundingTransaction(args: {
  sender: string;
  destination: string;
  amountRaw: bigint;
  solLamports: bigint;
}): Promise<{ transaction: string; lastValidBlockHeight: number }> {
  const { value } = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [
    { commitment: "confirmed" },
  ]);
  const tx = new Transaction({ feePayer: new PublicKey(args.sender), recentBlockhash: value.blockhash });
  tx.add(...fundingInstructions(args));
  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    lastValidBlockHeight: value.lastValidBlockHeight,
  };
}

export type SenderBalance = { usdcRaw: bigint; lamports: bigint };

/** What the sender holds, so "insufficient funds" is caught before a wallet prompt rather than by it. */
export async function readSenderBalance(sender: string): Promise<SenderBalance | null> {
  try {
    const [tokens, sol] = await Promise.all([
      rpc<{ value: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> }>(
        "getTokenAccountsByOwner",
        [sender, { mint: USDC_MINT }, { encoding: "jsonParsed", commitment: "confirmed" }],
      ),
      rpc<{ value: number }>("getBalance", [sender, { commitment: "confirmed" }]),
    ]);
    const usdcRaw = tokens.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
    return { usdcRaw, lamports: BigInt(sol.value) };
  } catch {
    return null; // Unknown is not zero: the caller must not claim the sender is short.
  }
}
