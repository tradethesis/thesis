import { describe, expect, it } from "vitest";

import { judgeIdentity, type VerifiedIdentity } from "./identity";
import { identityOf } from "./providers";

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const gift = { recipientSubject: "1450000000000000001", recipientHandleAtResolution: "kayle_build", destinationWallet: WALLET };
const me = (p: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
  providerUserId: "did:privy:recipient",
  twitterSubject: "1450000000000000001",
  twitterUsername: "kayle_build",
  solanaWallets: [WALLET],
  ...p,
});

describe("recipient identity", () => {
  it("accepts the bound X account with the provisioned wallet", () => {
    expect(judgeIdentity(me(), gift)).toEqual({ ok: true });
  });

  /* Handles change. The subject does not, so the gift follows the person. */
  it("follows a renamed handle: same account, new username", () => {
    expect(judgeIdentity(me({ twitterUsername: "kayle_ships" }), gift)).toEqual({ ok: true });
  });

  /* A handle can be released and taken by somebody else. They get a different subject. */
  it("refuses a reassigned handle: same username, different account", () => {
    const v = judgeIdentity(me({ twitterSubject: "999", twitterUsername: "kayle_build" }), gift);
    expect(v).toEqual({ ok: false, reason: "wrong_x_account", signedInAs: "kayle_build", intended: "kayle_build" });
  });

  it("refuses a signed-in user with no X account linked", () => {
    expect(judgeIdentity(me({ twitterSubject: null, twitterUsername: null }), gift)).toEqual({ ok: false, reason: "no_x_account" });
  });

  it("refuses the right person with a different wallet, rather than delivering elsewhere", () => {
    expect(judgeIdentity(me({ solanaWallets: ["So11111111111111111111111111111111111111112"] }), gift)).toEqual({ ok: false, reason: "wallet_mismatch" });
  });

  it("refuses when no wallet was ever provisioned", () => {
    expect(judgeIdentity(me(), { ...gift, destinationWallet: null })).toEqual({ ok: false, reason: "wallet_not_provisioned" });
  });

  /* Only what the provider verified counts, and only its embedded wallets. */
  it("reads a verified Privy user, ignoring an external wallet at the same address", () => {
    const verified = identityOf({
      id: "did:privy:recipient",
      linked_accounts: [
        { type: "twitter_oauth", subject: "1450000000000000001", username: "kayle_build" },
        { type: "wallet", chain_type: "solana", connector_type: "injected", address: "External1111111111111111111111111111111111" },
        { type: "wallet", chain_type: "solana", connector_type: "embedded", address: WALLET },
        { type: "wallet", chain_type: "ethereum", connector_type: "embedded", address: "0xabc" },
      ],
    } as never);
    expect(verified).toEqual({
      providerUserId: "did:privy:recipient",
      twitterSubject: "1450000000000000001",
      twitterUsername: "kayle_build",
      solanaWallets: [WALLET],
    });
  });
});
