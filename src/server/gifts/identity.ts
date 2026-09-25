/**
 * Does this verified person own this gift?
 *
 * Pure. The caller hands in what the identity provider verified server-side — never anything the
 * browser said about itself — and the gift as stored. Two things must both hold:
 *
 *   1. The verified Twitter subject equals the gift's bound subject. The subject, not the handle:
 *      handles are renamed and reassigned, subjects are not.
 *   2. That same verified user owns an embedded Solana wallet equal to the gift's destination.
 *
 * Either one alone is not enough. A matching subject with a different wallet means the person is
 * right and the destination is not, which must never be "fixed" by delivering somewhere else.
 */

export type VerifiedIdentity = {
  /** Privy's user ID, from the verified token. */
  providerUserId: string;
  /** The stable X account ID. Null when the user has no X account linked. */
  twitterSubject: string | null;
  twitterUsername: string | null;
  /** Embedded Solana wallets on this user, from the verified token. */
  solanaWallets: string[];
};

export type GiftBinding = {
  recipientSubject: string;
  recipientHandleAtResolution: string;
  destinationWallet: string | null;
};

export type IdentityVerdict =
  | { ok: true }
  | { ok: false; reason: "no_x_account" }
  | { ok: false; reason: "wrong_x_account"; signedInAs: string | null; intended: string }
  | { ok: false; reason: "wallet_not_provisioned" }
  | { ok: false; reason: "wallet_mismatch" };

export function judgeIdentity(identity: VerifiedIdentity, gift: GiftBinding): IdentityVerdict {
  if (!identity.twitterSubject) return { ok: false, reason: "no_x_account" };

  if (identity.twitterSubject !== gift.recipientSubject) {
    return {
      ok: false,
      reason: "wrong_x_account",
      signedInAs: identity.twitterUsername,
      intended: gift.recipientHandleAtResolution,
    };
  }

  if (!gift.destinationWallet) return { ok: false, reason: "wallet_not_provisioned" };
  if (!identity.solanaWallets.includes(gift.destinationWallet)) return { ok: false, reason: "wallet_mismatch" };

  return { ok: true };
}
