/**
 * Transaction bytes, in and out of the wallet.
 *
 * A gasless Jupiter RFQ transaction needs three signatures — Jupiter's fee payer,
 * Jupiter's gas payer, and the user — and arrives with all three slots empty. The wallet
 * must fill exactly one of them and change nothing else, which is what verifyUserSignature
 * proves: same message bytes, a real ed25519 signature over them, in the user's slot.
 *
 * @solana/web3.js is imported dynamically. It reaches for the Node Buffer global at import
 * time, and a static import can be hoisted above the polyfill, producing a
 * "Buffer is not defined" that only shows up in a production build.
 */

export const SIGNATURE_BYTES = 64;

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

/**
 * Split a serialized transaction into its signature slots and its message, without
 * deserializing. The wire format is a compact-u16 count (always one byte at these sizes)
 * followed by that many 64-byte signatures, then the message.
 */
export function splitTransaction(bytes: Uint8Array): { signatures: Uint8Array[]; message: Uint8Array } {
  const count = bytes[0];
  if (count > 8) throw new Error(`implausible signature count ${count}`);
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    signatures.push(bytes.slice(1 + i * SIGNATURE_BYTES, 1 + (i + 1) * SIGNATURE_BYTES));
  }
  return { signatures, message: bytes.slice(1 + count * SIGNATURE_BYTES) };
}

export function isEmptySignature(sig: Uint8Array): boolean {
  return sig.every((b) => b === 0);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Ask Phantom to sign, preserving the slots it must not touch. */
export async function signWithPhantom(unsignedB64: string, provider: { signTransaction<T>(t: T): Promise<T> }) {
  const { VersionedTransaction } = await import("@solana/web3.js");
  const tx = VersionedTransaction.deserialize(base64ToBytes(unsignedB64));
  const signed = await provider.signTransaction(tx);
  return bytesToBase64(signed.serialize());
}
