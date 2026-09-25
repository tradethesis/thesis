import { PrivyClient } from "@privy-io/node";

import type { VerifiedIdentity } from "./identity";

/**
 * The three outside services a funded gift needs, behind typed adapters.
 *
 * Each one answers `unavailable` when it is not configured, and the caller turns that into an
 * explicit state on screen. None of them has a fallback that pretends to work: a handle resolver
 * that guessed, or an identity check that trusted the browser, would route real money on a fiction.
 *
 * What each needs, by variable name only:
 *
 *   X lookup        X_API_BEARER_TOKEN                    handle -> stable account ID
 *   Privy (server)  NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET
 *                   (PRIVY_JWT_VERIFICATION_KEY optional; the SDK fetches it otherwise)
 *   Provisioning    GIFTS_PROVISION_WALLETS=1             creates real users in the Privy app
 *   Eligibility     GIFT_ELIGIBILITY_PROVIDER=open        anyone may open (hackathon; no location check)
 *   Master switch   GIFTS_LIVE=1                          nothing is live until this is set
 *
 * Provisioning has its own switch even when Privy is configured, because it is the one call here
 * with a lasting side effect in someone else's system: it creates a user and a wallet that will
 * still exist after this deployment is gone.
 */

export class Unavailable extends Error {
  constructor(
    readonly capability: "x_lookup" | "privy" | "provisioning" | "eligibility",
    readonly missing: string[],
  ) {
    super(`${capability} is not configured: ${missing.join(", ")}`);
    this.name = "Unavailable";
  }
}

export type Readiness = {
  xLookup: boolean;
  privy: boolean;
  provisioning: boolean;
  eligibility: boolean;
  /** Everything a live gift needs, end to end. */
  live: boolean;
  missing: string[];
};

export function readiness(env: NodeJS.ProcessEnv = process.env): Readiness {
  const missing: string[] = [];
  // Optional since accept-then-fund: without it (or without X credits) the recipient proves their
  // account by signing in, and gifts still send. Reported, never required.
  const xLookup = Boolean(env.X_API_BEARER_TOKEN);
  const privy = Boolean(env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET);
  if (!env.NEXT_PUBLIC_PRIVY_APP_ID) missing.push("NEXT_PUBLIC_PRIVY_APP_ID");
  if (!env.PRIVY_APP_SECRET) missing.push("PRIVY_APP_SECRET");
  const provisioning = privy && env.GIFTS_PROVISION_WALLETS === "1";
  if (env.GIFTS_PROVISION_WALLETS !== "1") missing.push("GIFTS_PROVISION_WALLETS");
  /*
   * `open`: anyone can open a gift. Chosen for the hackathon (23 September 2026) — there is no check
   * of where the recipient lives. The issuer does not offer these tokens to US persons or in its
   * listed restricted countries, so this must be replaced by a real check before a public launch.
   * An explicit value rather than a default, so "unchecked" is always a decision somebody wrote down.
   */
  // `attestation`: a declared country plus the connection's country, judged against the issuer's
  // list (eligibility.ts). The production setting.
  const eligibility = env.GIFT_ELIGIBILITY_PROVIDER === "open" || env.GIFT_ELIGIBILITY_PROVIDER === "attestation";
  if (!eligibility) missing.push("GIFT_ELIGIBILITY_PROVIDER");
  // The master switch: every capability can be configured and gifting still stays off until this is set.
  const switchedOn = env.GIFTS_LIVE === "1";
  if (!switchedOn) missing.push("GIFTS_LIVE");
  return { xLookup, privy, provisioning, eligibility, live: switchedOn && privy && provisioning && eligibility, missing };
}

/* ----------------------------------------------------------------- X lookup */

export type ResolvedAccount = {
  subject: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
};

export type ResolveOutcome =
  | { status: "resolved"; account: ResolvedAccount }
  | { status: "not_found" }
  | { status: "unreachable" };

/**
 * Resolve a handle to X's stable account ID.
 *
 * The only thing that can do this for somebody who has not signed up: Privy's lookups find its
 * own users only (verified against @privy-io/node 0.35.0). Endpoint and auth per the current X API
 * reference: GET https://api.x.com/2/users/by/username/{username}, app-only Bearer.
 */
export async function resolveHandle(handle: string, env: NodeJS.ProcessEnv = process.env): Promise<ResolveOutcome> {
  const token = env.X_API_BEARER_TOKEN;
  if (!token) throw new Unavailable("x_lookup", ["X_API_BEARER_TOKEN"]);
  const clean = handle.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) return { status: "not_found" };

  let res: Response;
  try {
    res = await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(clean)}?user.fields=profile_image_url`,
      { headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(8_000) },
    );
  } catch {
    return { status: "unreachable" };
  }
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) {
    // 402 is "credits depleted" on X's pay-per-use API: a billing state, not a missing account.
    console.error(`x lookup answered ${res.status}`);
    return { status: "unreachable" };
  }

  const body = (await res.json().catch(() => null)) as {
    data?: { id?: string; username?: string; name?: string; profile_image_url?: string };
  } | null;
  const d = body?.data;
  // X answers 200 with an `errors` array and no `data` for a suspended or unknown account.
  if (!d?.id || !/^\d{1,25}$/.test(d.id) || !d.username) return { status: "not_found" };

  return {
    status: "resolved",
    account: { subject: d.id, username: d.username, name: d.name ?? d.username, profileImageUrl: d.profile_image_url ?? null },
  };
}

/* ------------------------------------------------------------------- Privy */

/**
 * The X account behind a handle, if that person has ever signed in to this app with X — free, from
 * Privy's own records, no X API call. Privy stores the username as of their last sign-in, so a handle
 * renamed since can be stale; the sender still sees the name and picture and confirms before
 * anything is bound, exactly as with an X lookup.
 */
export async function privyAccountByHandle(handle: string, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedAccount | null> {
  const clean = handle.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) return null;
  let user: PrivyUser;
  try {
    user = (await privy(env).users().getByTwitterUsername({ username: clean })) as PrivyUser;
  } catch {
    return null; // Not a user yet: the ordinary case.
  }
  const accounts = (user.linked_accounts ?? []) as unknown as Array<Record<string, unknown>>;
  const tw = accounts.find((a) => a.type === "twitter_oauth");
  if (!tw || typeof tw.subject !== "string" || typeof tw.username !== "string") return null;
  if (tw.username.toLowerCase() !== clean.toLowerCase()) return null;
  return {
    subject: tw.subject,
    username: tw.username,
    name: typeof tw.name === "string" ? tw.name : tw.username,
    profileImageUrl: typeof tw.profile_picture_url === "string" ? tw.profile_picture_url : null,
  };
}

let client: PrivyClient | null = null;

function privy(env: NodeJS.ProcessEnv = process.env): PrivyClient {
  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Unavailable("privy", [!appId && "NEXT_PUBLIC_PRIVY_APP_ID", !appSecret && "PRIVY_APP_SECRET"].filter(Boolean) as string[]);
  }
  client ??= new PrivyClient({
    appId,
    appSecret,
    ...(env.PRIVY_JWT_VERIFICATION_KEY ? { jwtVerificationKey: env.PRIVY_JWT_VERIFICATION_KEY } : {}),
  });
  return client;
}

type PrivyUser = Awaited<ReturnType<ReturnType<PrivyClient["users"]>["getByTwitterSubject"]>>;

/** Reduce a Privy user to the facts a gift decision may rest on. */
export function identityOf(user: PrivyUser): VerifiedIdentity {
  // Read defensively: the SDK's union is wide, and only three fields of three account types matter.
  const accounts = (user.linked_accounts ?? []) as unknown as Array<Record<string, unknown>>;
  const twitter = accounts.find((a) => a.type === "twitter_oauth");
  // Embedded only. A user can also link an external wallet such as Phantom; that is theirs too, but
  // it is not the wallet this gift provisioned, and "also theirs" is not the same as "the one".
  const solanaWallets = accounts
    .filter(
      (a) =>
        a.type === "wallet" &&
        a.chain_type === "solana" &&
        a.connector_type === "embedded" &&
        typeof a.address === "string",
    )
    .map((a) => a.address as string);
  return {
    providerUserId: user.id,
    twitterSubject: typeof twitter?.subject === "string" ? twitter.subject : null,
    twitterUsername: typeof twitter?.username === "string" ? twitter.username : null,
    solanaWallets,
  };
}

export class IdentityRejected extends Error {
  constructor() {
    super("The sign-in could not be verified.");
    this.name = "IdentityRejected";
  }
}

/**
 * Verify a Privy identity token server-side and return who it proves.
 *
 * The browser sends the token; this function is the only thing that decides what it means. A
 * username, subject or wallet the browser reports alongside it is ignored.
 */
export async function verifyIdentity(identityToken: string): Promise<VerifiedIdentity> {
  const p = privy();
  try {
    const user = await p.utils().auth().verifyIdentityToken(identityToken);
    return identityOf(user as PrivyUser);
  } catch (error) {
    if (error instanceof Unavailable) throw error;
    throw new IdentityRejected();
  }
}

/**
 * The recipient's wallet, created before they sign up.
 *
 * Idempotent on the X subject: if Privy already has a user for it, that user's Solana wallet is
 * returned rather than a second user minted. Created with no additional signers, so Thesis cannot
 * move what is sent there — only a session authenticated as that X account can.
 */
export async function provisionRecipientWallet(
  account: ResolvedAccount,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ providerUserId: string; wallet: string }> {
  if (env.GIFTS_PROVISION_WALLETS !== "1") throw new Unavailable("provisioning", ["GIFTS_PROVISION_WALLETS"]);
  const users = privy(env).users();

  let user: PrivyUser | null = null;
  try {
    user = await users.getByTwitterSubject({ subject: account.subject });
  } catch {
    user = null; // Not found is the ordinary case for somebody who has never signed up.
  }

  if (!user) {
    user = (await users.create({
      linked_accounts: [{ type: "twitter_oauth", subject: account.subject, username: account.username, name: account.name }],
      wallets: [{ chain_type: "solana" }],
    })) as PrivyUser;
  }

  let { solanaWallets } = identityOf(user);
  if (!solanaWallets.length) {
    user = (await users.pregenerateWallets(user.id, { wallets: [{ chain_type: "solana" }] })) as PrivyUser;
    solanaWallets = identityOf(user).solanaWallets;
  }
  if (!solanaWallets.length) throw new Error("Privy returned no Solana wallet for the recipient.");

  return { providerUserId: user.id, wallet: solanaWallets[0] };
}
