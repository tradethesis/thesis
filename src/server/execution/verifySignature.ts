import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { splitTransaction, isEmptySignature, bytesEqual, base64ToBytes } from "@/lib/wallet/transaction";

/**
 * Did the wallet sign exactly the transaction we authored, and nothing else?
 *
 * This is the boundary the execute route will not cross without. A wallet that returns a
 * transaction whose message differs by a byte is returning a different transaction, and
 * the only safe response is to refuse it.
 */

export type SignatureVerdict =
  | {
      ok: true;
      messageHash: string;
      /** The user's own 64 bytes. In Case B this is the only fingerprint we get. */
      takerSignature: string;
      signerIndex: number;
      /** True when the user is the fee payer, so signatures[0] IS the txid. */
      signatureDerivable: boolean;
      derivedSignature: string | null;
    }
  | { ok: false; code: "message_altered" | "not_signed" | "bad_signature" | "not_a_signer"; message: string };

export function hashMessage(message: Uint8Array): string {
  return createHash("sha256").update(message).digest("hex");
}

export function verifyUserSignature(params: {
  unsignedB64: string;
  signedB64: string;
  wallet: string;
}): SignatureVerdict {
  const unsigned = splitTransaction(base64ToBytes(params.unsignedB64));
  const signed = splitTransaction(base64ToBytes(params.signedB64));

  if (!bytesEqual(unsigned.message, signed.message)) {
    return {
      ok: false,
      code: "message_altered",
      message: "the signed transaction does not carry the message we authored",
    };
  }

  const walletBytes = bs58.decode(params.wallet);
  const signerIndex = signed.signatures.findIndex(
    (sig, i) => !isEmptySignature(sig) && nacl.sign.detached.verify(signed.message, sig, walletBytes) && i >= 0,
  );

  if (signerIndex === -1) {
    const anySigned = signed.signatures.some((s) => !isEmptySignature(s));
    return anySigned
      ? { ok: false, code: "bad_signature", message: "a signature is present but does not verify for this wallet" }
      : { ok: false, code: "not_signed", message: "no signature was applied" };
  }

  // Slot 0 is the fee payer and its signature is the canonical txid. When that slot is
  // ours we can name the transaction before it is broadcast; when Jupiter pays, we cannot,
  // and reconciliation has to find it on chain by these bytes instead.
  const signatureDerivable = signerIndex === 0;

  return {
    ok: true,
    messageHash: hashMessage(signed.message),
    takerSignature: bs58.encode(signed.signatures[signerIndex]),
    signerIndex,
    signatureDerivable,
    derivedSignature: signatureDerivable ? bs58.encode(signed.signatures[0]) : null,
  };
}
