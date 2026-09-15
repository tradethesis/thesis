import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { db } from "../db/client";
import { walletSession } from "../db/schema";

/**
 * Wallet sessions, via Sign-In With Solana.
 *
 * PRD §12 wants a domain-bound nonce challenge, and TH-06 wants every database mutation to
 * require an authenticated wallet. Phantom implements SIWS natively, so the message is
 * built to that shape and the wallet shows a readable prompt rather than random bytes.
 *
 * Two things this deliberately does not do:
 *
 *   - It does not trust a signature on its own. A valid signature over *some* message
 *     proves nothing; the server re-parses the signed text and checks the domain, the
 *     nonce and the expiry against the row it issued.
 *   - It does not store the session token. Only sha256 of it, so a database read cannot
 *     impersonate anyone.
 */

const COOKIE = "thesis_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export const STATEMENT =
  "Sign in to Thesis. This proves you control this wallet. It does not approve any transaction and cannot move funds.";

export type Session = { wallet: string; sessionId: string };

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The exact text the wallet is asked to sign, and the text the server re-parses. */
export function buildSiwsMessage(params: {
  domain: string;
  uri: string;
  wallet: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    `${params.domain} wants you to sign in with your Solana account:`,
    params.wallet,
    "",
    STATEMENT,
    "",
    `URI: ${params.uri}`,
    "Version: 1",
    "Chain ID: solana:mainnet",
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
    `Expiration Time: ${params.expirationTime}`,
  ].join("\n");
}

export async function createChallenge(params: { wallet: string; domain: string; uri: string }) {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);

  await db.insert(walletSession).values({
    wallet: params.wallet,
    nonce,
    domain: params.domain,
    statement: STATEMENT,
    issuedAt,
    expiresAt,
    state: "challenged",
  });

  return {
    nonce,
    domain: params.domain,
    uri: params.uri,
    statement: STATEMENT,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
    message: buildSiwsMessage({
      domain: params.domain,
      uri: params.uri,
      wallet: params.wallet,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expirationTime: expiresAt.toISOString(),
    }),
  };
}

export type VerifyResult = { ok: true; wallet: string } | { ok: false; reason: string };

export async function verifyChallenge(params: {
  wallet: string;
  signature: string;
  signedMessage: string;
  domain: string;
}): Promise<VerifyResult> {
  let publicKey: Uint8Array;
  try {
    publicKey = bs58.decode(params.wallet);
    if (publicKey.length !== 32) return { ok: false, reason: "not a Solana address" };
  } catch {
    return { ok: false, reason: "not a Solana address" };
  }

  // 1. The signature must verify over exactly the bytes we were given.
  let signature: Uint8Array;
  try {
    signature = bs58.decode(params.signature);
  } catch {
    return { ok: false, reason: "signature is not base58" };
  }
  const messageBytes = new TextEncoder().encode(params.signedMessage);
  if (!nacl.sign.detached.verify(messageBytes, signature, publicKey)) {
    return { ok: false, reason: "signature does not verify for this wallet" };
  }

  // 2. The message must be one we issued. A signature over arbitrary text is not a login.
  const nonceLine = params.signedMessage.match(/^Nonce: (.+)$/m);
  if (!nonceLine) return { ok: false, reason: "signed message carries no nonce" };
  const nonce = nonceLine[1].trim();

  const [row] = await db
    .select()
    .from(walletSession)
    .where(
      and(
        eq(walletSession.nonce, nonce),
        eq(walletSession.wallet, params.wallet),
        eq(walletSession.state, "challenged"),
        gt(walletSession.expiresAt, new Date()),
      ),
    );
  if (!row) return { ok: false, reason: "challenge is unknown, already used, or expired" };
  if (row.domain !== params.domain) return { ok: false, reason: "challenge was issued for a different site" };

  // 3. And it must be byte-identical to what we would have issued for that nonce, so a
  //    valid nonce cannot be lifted into a different statement.
  const expected = buildSiwsMessage({
    domain: row.domain,
    uri: params.domain.startsWith("localhost") ? `http://${row.domain}` : `https://${row.domain}`,
    wallet: params.wallet,
    nonce,
    issuedAt: row.issuedAt.toISOString(),
    expirationTime: row.expiresAt.toISOString(),
  });
  const a = Buffer.from(expected);
  const b = Buffer.from(params.signedMessage);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signed message does not match the challenge we issued" };
  }

  const token = randomBytes(32).toString("hex");
  const authorizedAt = new Date();
  await db
    .update(walletSession)
    .set({
      state: "authorized",
      signature: params.signature,
      signedMessage: params.signedMessage,
      tokenHash: hash(token),
      authorizedAt,
      expiresAt: new Date(authorizedAt.getTime() + TTL_MS),
    })
    .where(eq(walletSession.id, row.id));

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });

  return { ok: true, wallet: params.wallet };
}

/** The wallet behind this request, or null. Every mutating route starts here. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ id: walletSession.id, wallet: walletSession.wallet })
    .from(walletSession)
    .where(
      and(
        eq(walletSession.tokenHash, hash(token)),
        eq(walletSession.state, "authorized"),
        gt(walletSession.expiresAt, new Date()),
      ),
    );
  return row ? { wallet: row.wallet, sessionId: row.id } : null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.update(walletSession).set({ state: "revoked" }).where(eq(walletSession.tokenHash, hash(token)));
  }
  jar.delete(COOKIE);
}
