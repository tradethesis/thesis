import { and, eq, inArray } from "drizzle-orm";

import { GIFT_MIN_RAW, giftDraftSchema } from "@/lib/gifts";
import type { ExecutionMode } from "../env";

import { db } from "../db/client";
import { asset, fill, investmentIntent } from "../db/schema";
import type { ChainReader } from "../execution/chain";

import { resolveGiftPack } from "./catalogue";
import { judgeEligibility, type Declaration } from "./eligibility";
import { imageUrl, usableBy } from "./images";
import { readFunding } from "./funding";
import { buildFundingTransaction, readSenderBalance, SOL_ALLOWANCE_LAMPORTS } from "./funding-tx";
import { judgeIdentity, type VerifiedIdentity } from "./identity";
import { deliveryOutcome, isFundsCommitted, type GiftState, type IntentStatusForDelivery } from "./lifecycle";
import {
  IdentityRejected,
  privyAccountByHandle,
  provisionRecipientWallet,
  readiness,
  resolveHandle,
  verifyIdentity,
  Unavailable,
  type ResolvedAccount,
} from "./providers";
import { createDraft, draftsInLastHour, paidLookupsToday, replaceInvite, setEligibility, xLookupsPerDay, getGift, getGiftByInvite, GiftConflict, knownIdempotencyKey, LIMITS, lookupCounts, recordLookup, transition, type GiftRow } from "./repository";

/**
 * The gift workflow.
 *
 * Every function returns a typed outcome for every expected situation — a wrong account, a missing
 * provider, an uncertain transfer — so the routes map each one to a screen instead of a 500. Only
 * genuine bugs throw.
 *
 * Authority comes from exactly two places. For the sender: the wallet in their verified Solana
 * session, passed in by the route. For the recipient: the identity the provider verified from their
 * token. Nothing in a request body, a URL or a fragment can stand in for either.
 */

type Conflict = { status: "conflict"; state: GiftState | null };
type NotYours = { status: "not_found" };

function conflictOf(error: unknown): Conflict | null {
  return error instanceof GiftConflict ? { status: "conflict", state: error.actual } : null;
}

async function ownedBy(giftId: string, senderWallet: string): Promise<GiftRow | null> {
  const g = await getGift(giftId);
  // A gift that is not yours is indistinguishable from one that does not exist.
  return g && g.senderWallet === senderWallet ? g : null;
}

/* ---------------------------------------------------------------- sender */

export async function startGift(args: { senderWallet: string; draft: unknown; idempotencyKey: string; centerImageId?: string | null }) {
  const parsed = giftDraftSchema.safeParse(args.draft);
  if (!parsed.success) return { status: "invalid" as const, message: parsed.error.issues[0]?.message ?? "Check the gift details." };
  const d = parsed.data;

  // A replay is answered from the ledger below; only new drafts count against the limit.
  if (!(await knownIdempotencyKey(args.idempotencyKey)) && (await draftsInLastHour(args.senderWallet)) >= LIMITS.draftsPerHour) {
    return { status: "rate_limited" as const };
  }

  const pack = await resolveGiftPack(d.packId);
  if (!pack) return { status: "allocation_unavailable" as const };
  // A preview made against an older allocation must not become a gift of a different one.
  if (pack.versionId !== d.versionId) return { status: "allocation_changed" as const };
  // A photo on the pack must be one this sender uploaded, and not one that was taken down.
  if (args.centerImageId && !(await usableBy(args.centerImageId, args.senderWallet))) return { status: "image_unavailable" as const };

  const { gift, inviteToken, replayed } = await createDraft({
    packId: d.packId,
    basketVersionId: d.versionId,
    amountUsd: d.amount,
    solAllowanceLamports: SOL_ALLOWANCE_LAMPORTS,
    senderWallet: args.senderWallet,
    senderName: d.sender,
    note: d.message,
    recipientHandle: d.recipient,
    idempotencyKey: args.idempotencyKey,
    centerImageId: args.centerImageId ?? null,
  });
  return { status: "created" as const, giftId: gift.id, inviteToken, replayed };
}

export type ResolveResult =
  | { status: "resolved"; account: ResolvedAccount }
  | { status: "not_found" }
  | { status: "unreachable" }
  | { status: "unavailable"; missing: string[] }
  | { status: "rate_limited" }
  | { status: "needs_acceptance" }
  | Conflict
  | NotYours;

/**
 * Who a handle is, without depending on a paid X lookup.
 *
 *   1. Privy: anyone who has signed in here with X. Free.
 *   2. X's API, only if a token is configured and it answers (it can be out of credits).
 *   3. Otherwise nobody can say yet, and the recipient proves it themselves by signing in with X
 *      before the gift is funded — accept-then-fund.
 *
 * An X answer of "no such account" is final: a handle that does not exist cannot accept anything.
 */
export async function findRecipient(
  handle: string,
  opts: { allowX?: boolean } = {},
): Promise<({ status: "resolved"; account: ResolvedAccount } | { status: "not_found" } | { status: "needs_acceptance" }) & { via: "privy" | "x" | "none" }> {
  const known = await privyAccountByHandle(handle).catch(() => null);
  if (known) return { status: "resolved", account: known, via: "privy" };
  if (process.env.X_API_BEARER_TOKEN && opts.allowX !== false) {
    const out = await resolveHandle(handle).catch(() => ({ status: "unreachable" as const }));
    if (out.status === "resolved" || out.status === "not_found") return { ...out, via: "x" };
    return { status: "needs_acceptance", via: "x" };
  }
  return { status: "needs_acceptance", via: "none" };
}

/** Look the handle up. Shown to the sender; nothing is bound until they confirm it. */
export async function lookUpRecipient(giftId: string, senderWallet: string): Promise<ResolveResult> {
  const g = await ownedBy(giftId, senderWallet);
  if (!g) return { status: "not_found" };
  if (g.state !== "draft") return { status: "conflict", state: g.state as GiftState };
  const used = await lookupCounts(g.id, senderWallet);
  if (used.gift >= LIMITS.lookupsPerGift || used.hour >= LIMITS.lookupsPerHour) return { status: "rate_limited" };
  try {
    // The site-wide budget for paid lookups: past it, this gift goes accept-then-fund instead.
    const allowX = (await paidLookupsToday()) < xLookupsPerDay();
    const { via, ...out } = await findRecipient(g.recipientHandleRequested, { allowX });
    await recordLookup(g, via);
    return out;
  } catch (error) {
    if (error instanceof Unavailable) return { status: "unavailable", missing: error.missing };
    throw error;
  }
}

export type ConfirmResult =
  | { status: "provisioned"; destinationWallet: string }
  | { status: "changed" }
  | { status: "not_found_on_x" }
  | { status: "unreachable" }
  | { status: "unavailable"; missing: string[] }
  | Conflict
  | NotYours;

/**
 * The sender confirms the account they were shown, and the recipient's wallet is created.
 *
 * `confirmedSubject` is what the sender saw. The handle is resolved again here and must still map
 * to it: a handle renamed or reassigned between the lookup and the confirmation would otherwise bind
 * the gift to somebody the sender never saw.
 */
export async function confirmRecipient(args: {
  giftId: string;
  senderWallet: string;
  confirmedSubject: string;
  idempotencyKey: string;
}): Promise<ConfirmResult> {
  const g = await ownedBy(args.giftId, args.senderWallet);
  if (!g) return { status: "not_found" };

  try {
    let account: ResolvedAccount;
    if (g.state === "draft") {
      const out = await findRecipient(g.recipientHandleRequested);
      if (out.status === "not_found") return { status: "not_found_on_x" };
      if (out.status === "needs_acceptance") return { status: "unreachable" };
      if (out.account.subject !== args.confirmedSubject) return { status: "changed" };
      account = out.account;
      await transition({
        giftId: g.id,
        from: "draft",
        to: "recipient_resolved",
        idempotencyKey: `${args.idempotencyKey}:resolve`,
        patch: {
          recipientSubject: account.subject,
          recipientHandleAtResolution: account.username,
          recipientDisplayName: account.name,
        },
      });
    } else if (g.state === "recipient_resolved" && g.recipientSubject === args.confirmedSubject) {
      account = { subject: g.recipientSubject, username: g.recipientHandleAtResolution ?? "", name: g.recipientDisplayName ?? "", profileImageUrl: null };
    } else if (g.state === "wallet_provisioned" && g.destinationWallet) {
      return { status: "provisioned", destinationWallet: g.destinationWallet };
    } else {
      return { status: "conflict", state: g.state as GiftState };
    }

    const { providerUserId, wallet } = await provisionRecipientWallet(account);
    const { gift } = await transition({
      giftId: g.id,
      from: "recipient_resolved",
      to: "wallet_provisioned",
      idempotencyKey: `${args.idempotencyKey}:provision`,
      patch: { recipientProviderUserId: providerUserId, destinationWallet: wallet },
    });
    return { status: "provisioned", destinationWallet: gift.destinationWallet! };
  } catch (error) {
    if (error instanceof Unavailable) return { status: "unavailable", missing: error.missing };
    return conflictOf(error) ?? rethrow(error);
  }
}

export type FundingTxResult =
  | { status: "ready"; transaction: string; amountUsd: number; solAllowanceLamports: string; destinationWallet: string }
  | { status: "insufficient_funds"; needUsdcRaw: string; haveUsdcRaw: string; needLamports: string; haveLamports: string }
  | Conflict
  | NotYours;

/**
 * The transaction for the sender to sign. Refused if their balance is known to be short; allowed
 * through if the balance could not be read, because unknown is not zero and the wallet's own
 * simulation will catch a real shortfall.
 */
export async function fundingTransaction(giftId: string, senderWallet: string): Promise<FundingTxResult> {
  const g = await ownedBy(giftId, senderWallet);
  if (!g) return { status: "not_found" };
  if (g.state !== "wallet_provisioned" || !g.destinationWallet) return { status: "conflict", state: g.state as GiftState };

  const need = BigInt(g.amountRaw);
  const needLamports = g.solAllowanceLamports + 10_000_000n; // allowance plus rent and fee headroom
  const have = await readSenderBalance(senderWallet);
  if (have && (have.usdcRaw < need || have.lamports < needLamports)) {
    return {
      status: "insufficient_funds",
      needUsdcRaw: need.toString(),
      haveUsdcRaw: have.usdcRaw.toString(),
      needLamports: needLamports.toString(),
      haveLamports: have.lamports.toString(),
    };
  }

  const { transaction } = await buildFundingTransaction({
    sender: senderWallet,
    destination: g.destinationWallet,
    amountRaw: need,
    solLamports: g.solAllowanceLamports,
  });
  return {
    status: "ready",
    transaction,
    amountUsd: g.amountUsd,
    solAllowanceLamports: g.solAllowanceLamports.toString(),
    destinationWallet: g.destinationWallet,
  };
}

export type FundingResult =
  | { status: "funded" }
  | { status: "reconciling"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "signature_in_use" }
  | Conflict
  | NotYours;

/**
 * Record the signature the sender's wallet broadcast, then read the chain.
 *
 * The signature is written first — `wallet_provisioned → funding_pending` — so a crash between
 * broadcast and confirmation leaves a row the reconciler can finish. From then on nothing asks the
 * sender to pay again: an unreadable transfer is `reconciling`, not failed.
 */
export async function submitFunding(args: {
  giftId: string;
  senderWallet: string;
  signature: string;
  idempotencyKey: string;
  chain: ChainReader;
}): Promise<FundingResult> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(args.signature)) return { status: "failed", reason: "not_a_signature" };
  const g = await ownedBy(args.giftId, args.senderWallet);
  if (!g) return { status: "not_found" };

  if (g.state === "wallet_provisioned") {
    try {
      await transition({
        giftId: g.id,
        from: "wallet_provisioned",
        to: "funding_pending",
        idempotencyKey: `${args.idempotencyKey}:submit`,
        patch: { fundingSignature: args.signature },
        detail: { signature: args.signature },
      });
    } catch (error) {
      // The funding signature is unique across gifts: one transfer funds one gift.
      if (isUniqueViolation(error)) return { status: "signature_in_use" };
      return conflictOf(error) ?? rethrow(error);
    }
  } else if (g.fundingSignature !== args.signature) {
    return { status: "conflict", state: g.state as GiftState };
  }

  return settleFunding(g.id, args.chain);
}

/** Read the chain for a gift whose funding is outstanding. Also the reconciler's entry point. */
export async function settleFunding(giftId: string, chain: ChainReader): Promise<FundingResult> {
  const g = await getGift(giftId);
  if (!g) return { status: "not_found" };
  if (g.state === "funded" || isFundsCommitted(g.state as GiftState) && !["funding_pending", "reconciling"].includes(g.state)) {
    return { status: "funded" };
  }
  if (!["funding_pending", "reconciling"].includes(g.state) || !g.fundingSignature || !g.destinationWallet) {
    return { status: "conflict", state: g.state as GiftState };
  }

  const evidence = await readFunding(
    { signature: g.fundingSignature, senderWallet: g.senderWallet, destinationWallet: g.destinationWallet, amountRaw: BigInt(g.amountRaw) },
    chain,
  );
  const from = g.state as "funding_pending" | "reconciling";

  try {
    if (evidence.outcome === "funded") {
      await transition({
        giftId: g.id,
        from,
        to: "funded",
        idempotencyKey: `fund:${g.id}:${g.fundingSignature}`,
        patch: { fundedSlot: evidence.slot, fundedAt: new Date((evidence.blockTime ?? Date.now() / 1000) * 1000) },
        detail: { slot: evidence.slot },
      });
      return { status: "funded" };
    }
    if (evidence.outcome === "mismatch") {
      await transition({
        giftId: g.id,
        from,
        to: "failed",
        idempotencyKey: `fail:${g.id}:${g.fundingSignature}`,
        patch: { failureReason: evidence.reason },
        detail: { reason: evidence.reason },
      });
      return { status: "failed", reason: evidence.reason };
    }
    if (from === "funding_pending") {
      await transition({
        giftId: g.id,
        from,
        to: "reconciling",
        idempotencyKey: `reconcile:${g.id}:${g.fundingSignature}`,
        detail: { reason: evidence.reason },
      });
    }
    return { status: "reconciling", reason: evidence.reason };
  } catch (error) {
    // Someone else settled it first. Report what it is now rather than acting twice.
    const c = conflictOf(error);
    if (c?.state === "funded") return { status: "funded" };
    return c ?? rethrow(error);
  }
}

export async function cancelGift(giftId: string, senderWallet: string, idempotencyKey: string) {
  const g = await ownedBy(giftId, senderWallet);
  if (!g) return { status: "not_found" as const };
  if (isFundsCommitted(g.state as GiftState)) return { status: "already_sent" as const };
  try {
    await transition({ giftId: g.id, from: g.state as GiftState, to: "cancelled", idempotencyKey });
    return { status: "cancelled" as const };
  } catch (error) {
    return conflictOf(error) ?? rethrow(error);
  }
}

/* ------------------------------------------------------------- recipient */

/**
 * What the invitation page may show. Deliberately narrow: no stable ID, no provider user ID, no
 * wallet, no sender wallet. The note and sender name are shown because the sender chose to share
 * the link; after the link expires they are withheld until the recipient signs in.
 */
export type InvitationView = {
  giftId: string;
  state: GiftState;
  packId: string;
  basketVersionId: string;
  amountUsd: number;
  senderName: string;
  note: string | null;
  intendedHandle: string;
  expired: boolean;
  centerImageUrl: string | null;
};

export async function viewInvitation(token: string): Promise<InvitationView | null> {
  const g = await getGiftByInvite(token);
  if (!g || g.state === "draft" || g.state === "cancelled") return null;
  const expired = g.inviteExpiresAt.getTime() < Date.now();
  return {
    giftId: g.id,
    state: g.state as GiftState,
    packId: g.packId,
    basketVersionId: g.basketVersionId,
    amountUsd: g.amountUsd,
    senderName: g.senderName,
    note: expired ? null : g.note,
    intendedHandle: g.recipientHandleAtResolution ?? g.recipientHandleRequested,
    expired,
    centerImageUrl: g.centerImageId ? imageUrl(g.centerImageId) : null,
  };
}

/** A holding the recipient actually received, read from confirmed fills — never the allocation. */
export type ConfirmedHolding = { mint: string; symbol: string; company: string; amount: string; signature: string };

export type ClaimResult =
  /** `intentId`: the purchase already attached to this gift, when an earlier open got that far. */
  | { status: "reserved"; destinationWallet: string; basketVersionId: string; amountUsd: number; intentId?: string | null }
  | { status: "opened"; partial: boolean; claimedAt: string | null; holdings: ConfirmedHolding[]; destinationWallet: string }
  | { status: "invalid_invitation" }
  | { status: "not_funded"; state: GiftState }
  | { status: "already_claimed" }
  | { status: "no_x_account" }
  | { status: "wrong_x_account"; signedInAs: string | null; intended: string }
  | { status: "wallet_mismatch" }
  | { status: "identity_rejected" }
  | { status: "eligibility_unavailable" }
  | { status: "declaration_required" }
  | { status: "ineligible"; reason: "declared" | "located" }
  | { status: "allocation_unavailable" }
  | { status: "unavailable"; missing: string[] };

/**
 * Reserve the gift for a verified recipient.
 *
 * `verify` is the identity provider, injected so tests can supply a designated stub and production
 * can only ever use the real one (see routes). Reservation binds the verified person before any
 * transfer, so two sessions racing to open the same gift cannot both proceed.
 */
export async function reserveClaim(args: {
  inviteToken: string;
  identityToken: string;
  verify: (token: string) => Promise<VerifiedIdentity>;
  idempotencyKey: string;
  /** Required where GIFT_ELIGIBILITY_PROVIDER=attestation: the recipient's country and declaration. */
  declaration?: Declaration | null;
  /** The country the request came from, as the platform reports it (x-vercel-ip-country). */
  ipCountry?: string | null;
}): Promise<ClaimResult> {
  const g = await getGiftByInvite(args.inviteToken);
  if (!g || g.state === "draft" || g.state === "cancelled") return { status: "invalid_invitation" };

  let identity: VerifiedIdentity;
  try {
    identity = await args.verify(args.identityToken);
  } catch (error) {
    if (error instanceof Unavailable) return { status: "unavailable", missing: error.missing };
    if (error instanceof IdentityRejected) return { status: "identity_rejected" };
    throw error;
  }

  // A gift with no bound account has never been funded, and nobody can be judged against it.
  if (!g.recipientSubject) return { status: "not_funded", state: g.state as GiftState };
  const verdict = judgeIdentity(identity, {
    recipientSubject: g.recipientSubject,
    recipientHandleAtResolution: g.recipientHandleAtResolution ?? g.recipientHandleRequested,
    destinationWallet: g.destinationWallet,
  });
  if (!verdict.ok) {
    if (verdict.reason === "wrong_x_account") return { status: "wrong_x_account", signedInAs: verdict.signedInAs, intended: verdict.intended };
    if (verdict.reason === "wallet_not_provisioned") return { status: "not_funded", state: g.state as GiftState };
    return { status: verdict.reason };
  }

  // Verified as the recipient, and it is already open: show them what they actually hold.
  if (["claimed", "claimed_partial"].includes(g.state)) {
    return {
      status: "opened",
      partial: g.state === "claimed_partial",
      claimedAt: g.claimedAt?.toISOString() ?? null,
      holdings: g.claimIntentId ? await confirmedHoldings(g.claimIntentId) : [],
      destinationWallet: g.destinationWallet!,
    };
  }
  // The same person resuming their own reservation gets it back.
  if (["claim_reserved", "delivering"].includes(g.state)) {
    if (g.claimedByProviderUserId === identity.providerUserId) {
      return { status: "reserved", destinationWallet: g.destinationWallet!, basketVersionId: g.basketVersionId, amountUsd: g.amountUsd, intentId: g.claimIntentId ?? null };
    }
    return { status: "already_claimed" };
  }
  if (g.state !== "funded") return { status: "not_funded", state: g.state as GiftState };

  // Opening acquires stock tokens, so eligibility is decided here, by the acquirer.
  const ready = readiness();
  if (!ready.eligibility) return { status: "eligibility_unavailable" };
  if (process.env.GIFT_ELIGIBILITY_PROVIDER === "attestation") {
    const verdict = judgeEligibility(args.declaration, args.ipCountry);
    if (verdict.status === "incomplete") return { status: "declaration_required" };
    if (verdict.status === "ineligible") {
      // Nothing is bought. The USDC is already theirs, in their wallet, and stays there.
      await setEligibility(g.id, "ineligible");
      return { status: "ineligible", reason: verdict.reason };
    }
  }

  const pack = await resolveGiftPack(g.packId);
  if (!pack || pack.versionId !== g.basketVersionId) return { status: "allocation_unavailable" };

  try {
    await transition({
      giftId: g.id,
      from: "funded",
      to: "claim_reserved",
      idempotencyKey: args.idempotencyKey,
      patch: { claimedByProviderUserId: identity.providerUserId, eligibility: "eligible" },
    });
  } catch (error) {
    const c = conflictOf(error);
    if (!c) throw error;
    // Lost the race. If the winner was this same verified person — a double tap, a second tab —
    // the reservation is theirs, and "already claimed" would be telling them off for their own claim.
    const now = await getGift(g.id);
    if (now && ["claim_reserved", "delivering"].includes(now.state) && now.claimedByProviderUserId === identity.providerUserId) {
      return { status: "reserved", destinationWallet: now.destinationWallet!, basketVersionId: now.basketVersionId, amountUsd: now.amountUsd };
    }
    if (c.state && ["claim_reserved", "delivering", "claimed", "claimed_partial"].includes(c.state)) return { status: "already_claimed" };
    return { status: "not_funded", state: c.state ?? "draft" };
  }
  return { status: "reserved", destinationWallet: g.destinationWallet!, basketVersionId: g.basketVersionId, amountUsd: g.amountUsd };
}

/**
 * Attach the recipient's purchase to the reservation. The intent must belong to the gift's wallet
 * and execute the gift's allocation version — a purchase of something else is not this delivery.
 */
export async function beginDelivery(args: { giftId: string; intentId: string; idempotencyKey: string }) {
  const g = await getGift(args.giftId);
  if (!g) return { status: "not_found" as const };
  const [intent] = await db
    .select({ wallet: investmentIntent.wallet, basketVersionId: investmentIntent.basketVersionId })
    .from(investmentIntent)
    .where(eq(investmentIntent.id, args.intentId));
  if (!intent || intent.wallet !== g.destinationWallet || intent.basketVersionId !== g.basketVersionId) {
    return { status: "intent_mismatch" as const };
  }
  try {
    await transition({
      giftId: g.id,
      from: "claim_reserved",
      to: "delivering",
      idempotencyKey: args.idempotencyKey,
      patch: { claimIntentId: args.intentId },
    });
    return { status: "delivering" as const };
  } catch (error) {
    return conflictOf(error) ?? rethrow(error);
  }
}

/** Settle delivery from the intent's reconciled status. Safe to call repeatedly. */
export async function settleDelivery(giftId: string) {
  const g = await getGift(giftId);
  if (!g || g.state !== "delivering" || !g.claimIntentId) return { status: "no_change" as const, state: (g?.state ?? null) as GiftState | null };
  const [intent] = await db.select({ status: investmentIntent.status }).from(investmentIntent).where(eq(investmentIntent.id, g.claimIntentId));
  const outcome = deliveryOutcome((intent?.status ?? "draft") as IntentStatusForDelivery);
  if (outcome === "pending") return { status: "no_change" as const, state: "delivering" as GiftState };

  const to: GiftState = outcome === "released" ? "funded" : outcome;
  try {
    await transition({
      giftId: g.id,
      from: "delivering",
      to,
      idempotencyKey: `deliver:${g.id}:${g.claimIntentId}:${to}`,
      patch: to === "funded" ? {} : { claimedAt: new Date() },
      detail: { intentStatus: intent?.status ?? null },
    });
  } catch (error) {
    return conflictOf(error) ?? rethrow(error);
  }
  return { status: "settled" as const, state: to };
}

/**
 * What the recipient received, from confirmed fills of their own purchase. Amounts are in each
 * token's own units. This is evidence of delivery; the pack's allocation is only what was aimed at.
 */
export async function confirmedHoldings(intentId: string): Promise<ConfirmedHolding[]> {
  const rows = await db
    .select({
      mint: fill.outputMint,
      outRaw: fill.outRaw,
      signature: fill.signature,
      symbol: asset.symbol,
      company: asset.company,
      decimals: asset.decimals,
    })
    .from(fill)
    .innerJoin(asset, eq(asset.mint, fill.outputMint))
    .where(and(eq(fill.intentId, intentId), inArray(fill.confirmationStatus, ["confirmed", "finalized"])));
  return rows.map((r) => ({
    mint: r.mint,
    symbol: r.symbol,
    company: r.company,
    amount: (Number(BigInt(r.outRaw)) / 10 ** r.decimals).toLocaleString("en-US", { maximumFractionDigits: 6 }),
    signature: r.signature,
  }));
}

/**
 * The mode a gift delivery runs in. Live only when the deployment is live *and* gifting has been
 * switched on as a whole — a gift recipient is never on LIVE_EXECUTION_WALLETS, so without this
 * every delivery would quietly simulate while the sender's USDC was real.
 */
export function giftExecutionMode(env: NodeJS.ProcessEnv = process.env): ExecutionMode {
  return env.EXECUTION_MODE === "live" && env.GIFTS_LIVE === "1" ? "live" : "simulation";
}

/**
 * May this purchase open this gift? Checked by /api/intents before the engine sees the request.
 * Everything comes from the record: reserved, bound to this signed-in wallet, and exactly the
 * gift's amount. A token that fails any of these buys nothing at the lowered floor.
 */
export async function giftPurchaseTerms(args: { token: string; wallet: string; budgetRaw: bigint }) {
  const g = await getGiftByInvite(args.token);
  if (!g || g.state !== "claim_reserved") return { ok: false as const, reason: "not_reserved" };
  if (g.destinationWallet !== args.wallet) return { ok: false as const, reason: "not_your_gift" };
  if (BigInt(g.amountRaw) !== args.budgetRaw) return { ok: false as const, reason: "wrong_amount" };
  return { ok: true as const, terms: { minRaw: GIFT_MIN_RAW, executionMode: giftExecutionMode(), basketVersionId: g.basketVersionId } };
}

/* ------------------------------------------------------------------ util */

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function rethrow(error: unknown): never {
  throw error;
}


/* ------------------------------------------------------------------ accept-then-fund */

/** The sender chose to let the recipient accept first: the link goes out before any money does. */
export async function requestAcceptance(giftId: string, senderWallet: string, idempotencyKey: string) {
  const g = await ownedBy(giftId, senderWallet);
  if (!g) return { status: "not_found" as const };
  if (g.state === "awaiting_recipient") return { status: "awaiting" as const };
  if (g.state !== "draft") return { status: "conflict" as const, state: g.state as GiftState };
  try {
    await transition({ giftId: g.id, from: "draft", to: "awaiting_recipient", idempotencyKey });
    return { status: "awaiting" as const };
  } catch (error) {
    const c = conflictOf(error);
    if (c) return c;
    throw error;
  }
}

/**
 * A fresh invitation link for a gift still waiting to be accepted. The link is shown once when a
 * gift is created; a sender who lost it gets a new one, and the old one stops working.
 */
export async function reissueInvite(giftId: string, senderWallet: string) {
  const g = await ownedBy(giftId, senderWallet);
  if (!g) return { status: "not_found" as const };
  if (g.state !== "awaiting_recipient") return { status: "conflict" as const, state: g.state as GiftState };
  const token = await replaceInvite(g.id, "awaiting_recipient");
  return token ? { status: "reissued" as const, inviteToken: token } : { status: "conflict" as const, state: "wallet_provisioned" as GiftState };
}

export type AcceptResult =
  | { status: "accepted" }
  | { status: "not_found" }
  | { status: "no_x_account" }
  | { status: "wrong_x_account"; signedInAs: string | null; intended: string }
  | { status: "identity_rejected" }
  | { status: "unavailable" }
  | Conflict;

/**
 * The recipient accepts by signing in with the X account the gift names. What decides it is the
 * verified identity token, never anything the browser says: its X username must be the handle the
 * sender typed, and from then on the gift is bound to that account's stable id and its wallet.
 */
export async function acceptInvitation(args: { token: string; identityToken: string; idempotencyKey: string; verify?: (token: string) => Promise<VerifiedIdentity> }): Promise<AcceptResult> {
  const g = await getGiftByInvite(args.token);
  if (!g) return { status: "not_found" };

  let identity: VerifiedIdentity;
  try {
    identity = await (args.verify ?? verifyIdentity)(args.identityToken);
  } catch (error) {
    if (error instanceof IdentityRejected) return { status: "identity_rejected" };
    if (error instanceof Unavailable) return { status: "unavailable" };
    throw error;
  }
  if (!identity.twitterSubject || !identity.twitterUsername) return { status: "no_x_account" };

  // Accepting twice, or after the sender already bound this same account, is simply accepted.
  if (g.state !== "awaiting_recipient") {
    if (g.recipientSubject && g.recipientSubject === identity.twitterSubject) return { status: "accepted" };
    return { status: "conflict", state: g.state as GiftState };
  }
  if (identity.twitterUsername.toLowerCase() !== g.recipientHandleRequested.toLowerCase()) {
    return { status: "wrong_x_account", signedInAs: identity.twitterUsername, intended: g.recipientHandleRequested };
  }

  let wallet = identity.solanaWallets[0];
  let providerUserId = identity.providerUserId;
  if (!wallet) {
    const made = await provisionRecipientWallet({ subject: identity.twitterSubject, username: identity.twitterUsername, name: identity.twitterUsername, profileImageUrl: null });
    wallet = made.wallet;
    providerUserId = made.providerUserId;
  }

  try {
    await transition({
      giftId: g.id,
      from: "awaiting_recipient",
      to: "wallet_provisioned",
      idempotencyKey: args.idempotencyKey,
      patch: {
        recipientSubject: identity.twitterSubject,
        recipientHandleAtResolution: identity.twitterUsername,
        recipientDisplayName: identity.twitterUsername,
        recipientProviderUserId: providerUserId,
        destinationWallet: wallet,
      },
    });
    return { status: "accepted" };
  } catch (error) {
    const c = conflictOf(error);
    if (!c) throw error;
    const now = await getGift(g.id);
    if (now?.recipientSubject === identity.twitterSubject) return { status: "accepted" };
    return c;
  }
}
