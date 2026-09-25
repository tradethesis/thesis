import { Keypair } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "../assets/allowlist";
import type { ChainReader, TransactionDetail } from "../execution/chain";

/*
 * The gift workflow against a real database.
 *
 * DESIGNATED STUBS. This file, and only this file, replaces the X lookup, wallet provisioning and
 * eligibility with fixed answers, and passes a stub chain reader and identity verifier. Production
 * routes import the real providers and the real chain reader; nothing here is reachable from them.
 *
 * Local only. The gift ledger is append-only by trigger, so rows written here cannot be removed by
 * ordinary means. The suite refuses to run against anything but a localhost database, and cleans
 * up in afterAll by disabling triggers for its own session — which needs a local superuser and is
 * exactly why it must never point anywhere else.
 */

const URL_ = process.env.DATABASE_URL ?? "";
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(URL_);
const d = describe.skipIf(!LOCAL);

const state = vi.hoisted(() => ({
  resolve: new Map<string, { subject: string; username: string; name: string }>(),
  /** Accounts only X knows about: never signed in here, so Privy can't find them. */
  xOnly: new Map<string, { subject: string; username: string; name: string }>(),
  eligible: true,
}));

vi.mock("./providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("./providers")>();
  return {
    ...real,
    // Privy knows everyone in the fixture map (they "signed in before"); anyone else is unknown,
    // and with no X token in the test environment that means accept-then-fund.
    privyAccountByHandle: vi.fn(async (handle: string) => {
      const a = state.resolve.get(handle.replace(/^@/, ""));
      return a ? { ...a, profileImageUrl: null } : null;
    }),
    resolveHandle: vi.fn(async (handle: string) => {
      const a = state.resolve.get(handle.replace(/^@/, "")) ?? state.xOnly.get(handle.replace(/^@/, ""));
      return a ? { status: "resolved", account: { ...a, profileImageUrl: null } } : { status: "not_found" };
    }),
    provisionRecipientWallet: vi.fn(async (account: { subject: string }) => ({
      providerUserId: `did:privy:test-${account.subject}`,
      wallet: walletFor(account.subject),
    })),
    readiness: vi.fn(() => ({
      xLookup: true, privy: true, provisioning: true, eligibility: state.eligible, live: state.eligible, missing: [],
    })),
  };
});

const wallets = new Map<string, string>();
function walletFor(subject: string): string {
  if (!wallets.has(subject)) wallets.set(subject, Keypair.generate().publicKey.toBase58());
  return wallets.get(subject)!;
}

/* Imported after the mock is registered. */
const svc = await import("./service");
const images = await import("./images");
const catalogue = await import("./catalogue");

/** A byte string that sniffs as webp. The server checks format by magic bytes, not by decoding. */
const fakeWebp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from(randomUUID().repeat(6))]);
const repo = await import("./repository");
// Most tests drive many gifts from one sender; the abuse limits get their own test below.
const limits = repo.LIMITS as { -readonly [K in keyof typeof repo.LIMITS]: number };
const REAL_LIMITS = { ...limits };
Object.assign(limits, { draftsPerHour: 1000, lookupsPerHour: 1000, lookupsPerGift: 1000 });
const { sql } = await import("../db/client");

const SENDER = Keypair.generate().publicKey.toBase58();
const OTHER_UPLOADER = Keypair.generate().publicKey.toBase58();
const TAG = "gift-test";

let pack: { id: string; versionId: string; thesisVersionId: string };

/** A stub chain reader that shows `sent` USDC leaving SENDER and arriving at `dest`. */
function chainShowing(opts: { dest: string; amountRaw: bigint; status?: "confirmed" | "unreadable" }): ChainReader {
  const tx: TransactionDetail = {
    slot: 301_000_000,
    blockTime: Math.floor(Date.now() / 1000),
    signatures: [],
    err: null,
    fee: 5000,
    preTokenBalances: [{ accountIndex: 1, mint: USDC_MINT, owner: SENDER, uiTokenAmount: { amount: "1000000000", decimals: 6 } }],
    postTokenBalances: [
      { accountIndex: 1, mint: USDC_MINT, owner: SENDER, uiTokenAmount: { amount: String(1_000_000_000n - opts.amountRaw), decimals: 6 } },
      { accountIndex: 2, mint: USDC_MINT, owner: opts.dest, uiTokenAmount: { amount: String(opts.amountRaw), decimals: 6 } },
    ],
  };
  return {
    async getSignatureStatuses() {
      return opts.status === "unreadable" ? null : [{ slot: tx.slot, confirmationStatus: "confirmed", err: null }];
    },
    async getTransaction() { return tx; },
    async getSignaturesForAddress() { return []; },
    async isBlockhashValid() { return true; },
    async getSlot() { return tx.slot; },
  };
}

const sig = () => Keypair.generate().publicKey.toBase58() + Keypair.generate().publicKey.toBase58().slice(0, 44);

/** Drive a gift through the real service to `wallet_provisioned`. */
async function provisioned(handle: string, subject: string) {
  state.resolve.set(handle, { subject, username: handle, name: handle });
  const created = await svc.startGift({
    senderWallet: SENDER,
    idempotencyKey: randomUUID(),
    draft: { packId: pack.id, versionId: pack.versionId, recipient: handle, sender: TAG, message: "for you", amount: 100 },
  });
  if (created.status !== "created") throw new Error(`startGift: ${created.status}`);
  const confirmed = await svc.confirmRecipient({ giftId: created.giftId, senderWallet: SENDER, confirmedSubject: subject, idempotencyKey: randomUUID() });
  if (confirmed.status !== "provisioned") throw new Error(`confirm: ${confirmed.status}`);
  return { giftId: created.giftId, token: created.inviteToken!, wallet: confirmed.destinationWallet };
}

/** ...and on to `funded`. */
async function funded(handle: string, subject: string) {
  const g = await provisioned(handle, subject);
  const r = await svc.submitFunding({
    giftId: g.giftId, senderWallet: SENDER, signature: sig(), idempotencyKey: randomUUID(),
    chain: chainShowing({ dest: g.wallet, amountRaw: 100_000_000n }),
  });
  if (r.status !== "funded") throw new Error(`fund: ${r.status}`);
  return g;
}

const verifyAs = (subject: string, wallet: string, username = "someone") => async () => ({
  providerUserId: `did:privy:test-${subject}`,
  twitterSubject: subject,
  twitterUsername: username,
  solanaWallets: [wallet],
});

beforeAll(async () => {
  if (!LOCAL) return;
  const [row] = await sql<{ id: string; version_id: string; thesis_version_id: string }[]>`
    SELECT b.slug AS id, bv.id AS version_id, bt.thesis_version_id
      FROM basket b
      JOIN basket_version bv ON bv.id = b.execution_version_id
      JOIN basket_thesis bt ON bt.basket_version_id = bv.id AND bt.role = 'origin'
     WHERE b.slug = 'ai-spending-chain'`;
  pack = { id: row.id, versionId: row.version_id, thesisVersionId: row.thesis_version_id };
});

afterAll(async () => {
  if (!LOCAL) return;
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const ids = (await tx<{ id: string; claim_intent_id: string | null }[]>`SELECT id, claim_intent_id FROM gift WHERE sender_name = ${TAG}`);
    const giftIds = ids.map((r) => r.id);
    const intentIds = ids.map((r) => r.claim_intent_id).filter(Boolean) as string[];
    if (giftIds.length) {
      await tx`DELETE FROM gift_event WHERE gift_id = ANY(${giftIds}::uuid[])`;
      await tx`DELETE FROM gift WHERE id = ANY(${giftIds}::uuid[])`;
    }
    if (intentIds.length) await tx`DELETE FROM investment_intent WHERE id = ANY(${intentIds}::uuid[])`;
    await tx`DELETE FROM gift_image WHERE uploaded_by_wallet = ANY(${[SENDER, OTHER_UPLOADER]})`;
    await tx`DELETE FROM gift_pack_design WHERE created_by_wallet = ${SENDER}`;
  });
});

d("gift workflow on a real database", () => {
  it("replays a duplicate create instead of making a second gift or a second invitation", async () => {
    const key = randomUUID();
    const draft = { packId: pack.id, versionId: pack.versionId, recipient: "dupe_one", sender: TAG, message: "", amount: 150 };
    const a = await svc.startGift({ senderWallet: SENDER, idempotencyKey: key, draft });
    const b = await svc.startGift({ senderWallet: SENDER, idempotencyKey: key, draft });
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    if (a.status !== "created" || b.status !== "created") return;
    expect(b.giftId).toBe(a.giftId);
    expect(a.inviteToken).toBeTruthy();
    expect(b.inviteToken).toBeNull(); // shown once; a replay cannot recover or re-mint it
    expect(b.replayed).toBe(true);
  });

  it("caps new drafts per sender per hour, and never counts a replay", async () => {
    limits.draftsPerHour = REAL_LIMITS.draftsPerHour;
    const busy = Keypair.generate().publicKey.toBase58();
    const draft = (n: number) => ({ packId: pack.id, versionId: pack.versionId, recipient: `limit_${n}`, sender: TAG, message: "", amount: 10 });
    const keys: string[] = [];
    for (let n = 0; n < repo.LIMITS.draftsPerHour; n++) {
      keys.push(randomUUID());
      expect((await svc.startGift({ senderWallet: busy, idempotencyKey: keys[n], draft: draft(n) })).status).toBe("created");
    }
    expect((await svc.startGift({ senderWallet: busy, idempotencyKey: randomUUID(), draft: draft(99) })).status).toBe("rate_limited");
    // A retry of a request already made is answered from the ledger, limit or not.
    expect((await svc.startGift({ senderWallet: busy, idempotencyKey: keys[0], draft: draft(0) })).status).toBe("created");
    limits.draftsPerHour = 1000;
  });

  it("refuses a preview made against an older allocation version", async () => {
    const r = await svc.startGift({
      senderWallet: SENDER, idempotencyKey: randomUUID(),
      draft: { packId: pack.id, versionId: randomUUID(), recipient: "stale", sender: TAG, message: "", amount: 100 },
    });
    expect(r.status).toBe("allocation_changed");
  });

  /* The handle is resolved again at confirmation. If it now maps to somebody else, the sender is
     told, instead of the gift being bound to an account they never saw. */
  it("refuses to bind when the handle changed hands between lookup and confirmation", async () => {
    state.resolve.set("moving_handle", { subject: "111", username: "moving_handle", name: "A" });
    const created = await svc.startGift({
      senderWallet: SENDER, idempotencyKey: randomUUID(),
      draft: { packId: pack.id, versionId: pack.versionId, recipient: "moving_handle", sender: TAG, message: "", amount: 100 },
    });
    if (created.status !== "created") throw new Error();
    const seen = await svc.lookUpRecipient(created.giftId, SENDER);
    expect(seen).toMatchObject({ status: "resolved", account: { subject: "111" } });

    state.resolve.set("moving_handle", { subject: "222", username: "moving_handle", name: "B" }); // reassigned
    const r = await svc.confirmRecipient({ giftId: created.giftId, senderWallet: SENDER, confirmedSubject: "111", idempotencyKey: randomUUID() });
    expect(r.status).toBe("changed");
    expect((await repo.getGift(created.giftId))!.state).toBe("draft");
  });

  it("hides another sender's gift entirely", async () => {
    const g = await provisioned("private_one", "3001");
    expect((await svc.lookUpRecipient(g.giftId, Keypair.generate().publicKey.toBase58())).status).toBe("not_found");
  });

  it("funds only on chain evidence, and replays a duplicate submission", async () => {
    const g = await provisioned("fund_me", "3002");
    const s = sig();
    const key = randomUUID();
    const chain = chainShowing({ dest: g.wallet, amountRaw: 100_000_000n });
    expect((await svc.submitFunding({ giftId: g.giftId, senderWallet: SENDER, signature: s, idempotencyKey: key, chain })).status).toBe("funded");
    expect((await svc.submitFunding({ giftId: g.giftId, senderWallet: SENDER, signature: s, idempotencyKey: key, chain })).status).toBe("funded");
    const events = await repo.giftEvents(g.giftId);
    expect(events.filter((e) => e.toState === "funded")).toHaveLength(1);
  });

  it("will not let one transfer fund two gifts", async () => {
    const a = await provisioned("one_sig_a", "3003");
    const b = await provisioned("one_sig_b", "3004");
    const s = sig();
    await svc.submitFunding({ giftId: a.giftId, senderWallet: SENDER, signature: s, idempotencyKey: randomUUID(), chain: chainShowing({ dest: a.wallet, amountRaw: 100_000_000n }) });
    const r = await svc.submitFunding({ giftId: b.giftId, senderWallet: SENDER, signature: s, idempotencyKey: randomUUID(), chain: chainShowing({ dest: b.wallet, amountRaw: 100_000_000n }) });
    expect(r.status).toBe("signature_in_use");
    expect((await repo.getGift(b.giftId))!.state).toBe("wallet_provisioned");
  });

  it("fails a transfer whose evidence contradicts the gift", async () => {
    const g = await provisioned("wrong_amount", "3005");
    const r = await svc.submitFunding({ giftId: g.giftId, senderWallet: SENDER, signature: sig(), idempotencyKey: randomUUID(), chain: chainShowing({ dest: g.wallet, amountRaw: 80_000_000n }) });
    expect(r).toEqual({ status: "failed", reason: "wrong_amount" });
  });

  /* Crash or RPC outage between broadcast and confirmation. The signature is already recorded, so
     the gift waits in `reconciling`, and fresh evidence finishes it — no second transfer. */
  it("recovers an uncertain transfer from its recorded signature", async () => {
    const g = await provisioned("uncertain", "3006");
    const s = sig();
    const first = await svc.submitFunding({ giftId: g.giftId, senderWallet: SENDER, signature: s, idempotencyKey: randomUUID(), chain: chainShowing({ dest: g.wallet, amountRaw: 100_000_000n, status: "unreadable" }) });
    expect(first.status).toBe("reconciling");
    const row = await repo.getGift(g.giftId);
    expect(row!.state).toBe("reconciling");
    expect(row!.fundingSignature).toBe(s);

    // No path offers the sender a new transaction while one is outstanding.
    expect((await svc.fundingTransaction(g.giftId, SENDER)).status).toBe("conflict");

    const later = await svc.settleFunding(g.giftId, chainShowing({ dest: g.wallet, amountRaw: 100_000_000n }));
    expect(later.status).toBe("funded");
  });

  it("refuses to cancel once payment has been requested", async () => {
    const g = await funded("no_cancel", "3007");
    expect((await svc.cancelGift(g.giftId, SENDER, randomUUID())).status).toBe("already_sent");
  });

  it("refuses the wrong X account and leaves the gift untouched", async () => {
    const g = await funded("right_person", "3008");
    const r = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("9999", g.wallet, "impostor") });
    expect(r).toEqual({ status: "wrong_x_account", signedInAs: "impostor", intended: "right_person" });
    expect((await repo.getGift(g.giftId))!.state).toBe("funded");
  });

  it("refuses the right account with the wrong wallet", async () => {
    const g = await funded("wallet_bind", "3009");
    const r = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3009", Keypair.generate().publicKey.toBase58()) });
    expect(r.status).toBe("wallet_mismatch");
  });

  it("does not reserve when eligibility cannot be decided", async () => {
    const g = await funded("no_eligibility", "3010");
    state.eligible = false;
    try {
      const r = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3010", g.wallet) });
      expect(r.status).toBe("eligibility_unavailable");
      expect((await repo.getGift(g.giftId))!.state).toBe("funded");
    } finally {
      state.eligible = true;
    }
  });

  /* Two sessions open the same gift at the same instant. Exactly one reservation is recorded. */
  it("lets exactly one of two racing claims win", async () => {
    const g = await funded("race", "3011");
    const verify = verifyAs("3011", g.wallet);
    const [a, b] = await Promise.all([
      svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify }),
      svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify }),
    ]);
    // Same person on both: the loser gets the winner's reservation back, not "already claimed".
    expect([a.status, b.status]).toEqual(["reserved", "reserved"]);
    const events = await repo.giftEvents(g.giftId);
    expect(events.filter((e) => e.toState === "claim_reserved")).toHaveLength(1);
  });

  it("tells a different person racing for the same gift that it is taken", async () => {
    const g = await funded("race_two", "3018");
    await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3018", g.wallet) });
    // A second Privy user somehow bound to the same subject and wallet (for example after an
    // account merge) must not be able to take over a reservation that is not theirs.
    const intruder = async () => ({ providerUserId: "did:privy:other", twitterSubject: "3018", twitterUsername: "x", solanaWallets: [g.wallet] });
    const r = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: intruder });
    expect(r.status).toBe("already_claimed");
  });

  it("settles a partial fill as claimed_partial, leaving the rest as USDC in their wallet", async () => {
    const g = await funded("partial", "3012");
    await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3012", g.wallet) });
    const [intent] = await sql<{ id: string }[]>`
      INSERT INTO investment_intent (idempotency_key, wallet, thesis_version_id, basket_version_id, direction, input_mint, weights_bps, status, execution_mode)
      VALUES (${randomUUID()}, ${g.wallet}, ${pack.thesisVersionId}, ${pack.versionId}, 'buy', ${USDC_MINT}, '[]'::jsonb, 'partial', 'simulation')
      RETURNING id`;
    expect((await svc.beginDelivery({ giftId: g.giftId, intentId: intent.id, idempotencyKey: randomUUID() })).status).toBe("delivering");
    expect(await svc.settleDelivery(g.giftId)).toEqual({ status: "settled", state: "claimed_partial" });
    // Settling again changes nothing.
    expect((await svc.settleDelivery(g.giftId)).status).toBe("no_change");

    // The verified recipient coming back sees it as opened, with what was confirmed — here, nothing
    // yet, because no fill was recorded. An empty list, never the allocation standing in for it.
    const back = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3012", g.wallet) });
    expect(back).toMatchObject({ status: "opened", partial: true, holdings: [] });
  });

  it("refuses to attach a purchase of something else, or from another wallet", async () => {
    const g = await funded("mismatch_intent", "3013");
    await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3013", g.wallet) });
    const other = Keypair.generate().publicKey.toBase58();
    const [intent] = await sql<{ id: string }[]>`
      INSERT INTO investment_intent (idempotency_key, wallet, thesis_version_id, basket_version_id, direction, input_mint, weights_bps, status, execution_mode)
      VALUES (${randomUUID()}, ${other}, ${pack.thesisVersionId}, ${pack.versionId}, 'buy', ${USDC_MINT}, '[]'::jsonb, 'complete', 'simulation')
      RETURNING id`;
    expect((await svc.beginDelivery({ giftId: g.giftId, intentId: intent.id, idempotencyKey: randomUUID() })).status).toBe("intent_mismatch");
    await sql`DELETE FROM investment_intent WHERE id = ${intent.id}`;
  });

  /* The link expires; the gift does not. Funds are the recipient's whatever the calendar says. */
  it("withholds the note on an expired link but still lets the verified recipient open it", async () => {
    const g = await funded("expired", "3014");
    await sql`UPDATE gift SET invite_expires_at = now() - interval '1 day' WHERE id = ${g.giftId}`;
    const view = await svc.viewInvitation(g.token);
    expect(view).toMatchObject({ expired: true, note: null });
    const r = await svc.reserveClaim({ inviteToken: g.token, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("3014", g.wallet) });
    expect(r.status).toBe("reserved");
  });

  it("refuses a malformed or unknown invitation without touching the database", async () => {
    expect(await svc.viewInvitation("../../etc/passwd")).toBeNull();
    expect(await svc.viewInvitation("A".repeat(22))).toBeNull();
  });

  describe("the database holds the line even if the code does not", () => {
    it("freezes the terms once payment has been requested", async () => {
      const g = await funded("frozen", "3015");
      await expect(sql`UPDATE gift SET amount_usd = 1000, amount_raw = 1000000000 WHERE id = ${g.giftId}`).rejects.toThrow(/frozen/);
      await expect(sql`UPDATE gift SET destination_wallet = ${SENDER} WHERE id = ${g.giftId}`).rejects.toThrow(/frozen/);
    });

    it("keeps the ledger append-only", async () => {
      const g = await funded("ledger", "3016");
      await expect(sql`DELETE FROM gift_event WHERE gift_id = ${g.giftId}`).rejects.toThrow(/append-only/);
      await expect(sql`UPDATE gift_event SET to_state = 'claimed' WHERE gift_id = ${g.giftId}`).rejects.toThrow(/append-only/);
    });

    it("freezes the photo with the other terms", async () => {
      const g = await funded("frozen_photo", "3018");
      const img = await images.saveImage(SENDER, fakeWebp(), 512, 512);
      if (img.status !== "saved") throw new Error(img.status);
      await expect(sql`UPDATE gift SET center_image_id = ${img.id} WHERE id = ${g.giftId}`).rejects.toThrow(/frozen/);
    });

    it("keeps gift amounts between $1 and $1,000", async () => {
      const g = await provisioned("one_dollar", "3019");
      await expect(sql`UPDATE gift SET amount_usd = 0, amount_raw = 0 WHERE id = ${g.giftId}`).rejects.toThrow(/gift_amount_range/);
      await sql`UPDATE gift SET amount_usd = 1, amount_raw = 1000000 WHERE id = ${g.giftId}`;
    });

    it("refuses a state without its evidence", async () => {
      const g = await provisioned("no_evidence", "3017");
      await expect(sql`UPDATE gift SET state = 'funded' WHERE id = ${g.giftId}`).rejects.toThrow(/gift_state_requires/);
    });
  });

  describe("pack photos", () => {
    it("keeps only real, small images, once each", async () => {
      expect((await images.saveImage(SENDER, Buffer.alloc(50), 512, 512)).status).toBe("invalid");
      expect((await images.saveImage(SENDER, Buffer.from("x".repeat(500)), 512, 512)).status).toBe("invalid");
      expect((await images.saveImage(SENDER, Buffer.alloc(400_000), 512, 512)).status).toBe("invalid");
      expect((await images.saveImage(SENDER, fakeWebp(), 9999, 512)).status).toBe("invalid");
      const bytes = fakeWebp();
      const a = await images.saveImage(SENDER, bytes, 512, 512);
      const b = await images.saveImage(SENDER, bytes, 512, 512);
      expect(a.status).toBe("saved");
      if (a.status !== "saved" || b.status !== "saved") return;
      expect(b.id).toBe(a.id);
      expect((await images.readImage(a.id))?.mime).toBe("image/webp");
    });

    it("lets a sender use only their own photo, and a takedown removes it everywhere", async () => {
      const mine = await images.saveImage(SENDER, fakeWebp(), 512, 512);
      const theirs = await images.saveImage(OTHER_UPLOADER, fakeWebp(), 512, 512);
      if (mine.status !== "saved" || theirs.status !== "saved") throw new Error("setup");
      const draft = { packId: pack.id, versionId: pack.versionId, recipient: "photo_one", sender: TAG, message: "", amount: 5 };
      expect((await svc.startGift({ senderWallet: SENDER, idempotencyKey: randomUUID(), draft, centerImageId: theirs.id })).status).toBe("image_unavailable");
      const ok = await svc.startGift({ senderWallet: SENDER, idempotencyKey: randomUUID(), draft, centerImageId: mine.id });
      expect(ok.status).toBe("created");
      if (ok.status !== "created") return;
      const [row] = await sql<{ center_image_id: string }[]>`SELECT center_image_id FROM gift WHERE id = ${ok.giftId}`;
      expect(row.center_image_id).toBe(mine.id);

      await sql`UPDATE gift_image SET removed_at = now() WHERE id = ${mine.id}`;
      expect(await images.readImage(mine.id)).toBeNull();
      expect(await images.usableBy(mine.id, SENDER)).toBe(false);
    });
  });

  describe("packs somebody built", () => {
    it("resolve through the thesis they published, by the same rule as curated packs", async () => {
      await sql`INSERT INTO gift_pack_design (thesis_slug, name, color, created_by_wallet)
                VALUES ('ai-spending-keeps-growing', 'For Kayle', 'gold', ${SENDER}) ON CONFLICT DO NOTHING`;
      const p = await catalogue.resolveGiftPack("my-ai-spending-keeps-growing");
      expect(p?.name).toBe("For Kayle");
      expect(p?.color).toBe("gold");
      expect(p?.holdings).toHaveLength(3);
      expect(p?.buySlug).toBe("ai-spending-keeps-growing");
      expect(await catalogue.resolveGiftPack("my-no-such-thesis")).toBeNull();
    });

    it("refuse a basket that holds something not on the allowlist", async () => {
      await sql`INSERT INTO gift_pack_design (thesis_slug, name, color, created_by_wallet)
                VALUES ('the-ai-money-is-private-now', 'Private labs', 'blue', ${SENDER}) ON CONFLICT DO NOTHING`;
      expect(await catalogue.resolveGiftPack("my-the-ai-money-is-private-now")).toBeNull();
    });
  });

  describe("accept-then-fund, when nobody can say who a handle is", () => {
    it("waits for the recipient, binds whoever proves the handle with X, then funds as usual", async () => {
      const created = await svc.startGift({
        senderWallet: SENDER, idempotencyKey: randomUUID(),
        draft: { packId: pack.id, versionId: pack.versionId, recipient: "new_friend", sender: TAG, message: "", amount: 5 },
      });
      if (created.status !== "created") throw new Error(created.status);
      expect((await svc.lookUpRecipient(created.giftId, SENDER)).status).toBe("needs_acceptance");
      expect((await svc.requestAcceptance(created.giftId, SENDER, randomUUID())).status).toBe("awaiting");
      expect((await svc.viewInvitation(created.inviteToken!))?.state).toBe("awaiting_recipient");

      const wallet = Keypair.generate().publicKey.toBase58();
      const wrong = await svc.acceptInvitation({ token: created.inviteToken!, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("7001", wallet, "someone_else") });
      expect(wrong.status).toBe("wrong_x_account");

      const ok = await svc.acceptInvitation({ token: created.inviteToken!, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("7002", wallet, "New_Friend") });
      expect(ok.status).toBe("accepted");
      const again = await svc.acceptInvitation({ token: created.inviteToken!, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("7002", wallet, "new_friend") });
      expect(again.status).toBe("accepted");
      const late = await svc.acceptInvitation({ token: created.inviteToken!, identityToken: "t", idempotencyKey: randomUUID(), verify: verifyAs("7003", wallet, "new_friend") });
      expect(late.status).toBe("conflict");

      const [row] = await sql<{ state: string; recipient_subject: string; destination_wallet: string }[]>`SELECT state, recipient_subject, destination_wallet FROM gift WHERE id = ${created.giftId}`;
      expect(row).toEqual({ state: "wallet_provisioned", recipient_subject: "7002", destination_wallet: wallet });

      const funded = await svc.submitFunding({
        giftId: created.giftId, senderWallet: SENDER, signature: sig(), idempotencyKey: randomUUID(),
        chain: chainShowing({ dest: wallet, amountRaw: 5_000_000n }),
      });
      expect(funded.status).toBe("funded");
    });

    it("gives a sender who lost the link a new one, and the old one stops working", async () => {
      const created = await svc.startGift({
        senderWallet: SENDER, idempotencyKey: randomUUID(),
        draft: { packId: pack.id, versionId: pack.versionId, recipient: "lost_link", sender: TAG, message: "", amount: 5 },
      });
      if (created.status !== "created") throw new Error(created.status);
      await svc.requestAcceptance(created.giftId, SENDER, randomUUID());
      const r = await svc.reissueInvite(created.giftId, SENDER);
      expect(r.status).toBe("reissued");
      if (r.status !== "reissued") return;
      expect(await svc.viewInvitation(created.inviteToken!)).toBeNull();
      expect((await svc.viewInvitation(r.inviteToken))?.state).toBe("awaiting_recipient");
      expect((await svc.reissueInvite(created.giftId, OTHER_UPLOADER)).status).toBe("not_found");
    });

    it("still sends at once to somebody who has signed in here before", async () => {
      state.resolve.set("known_friend", { subject: "7010", username: "known_friend", name: "Known" });
      const created = await svc.startGift({
        senderWallet: SENDER, idempotencyKey: randomUUID(),
        draft: { packId: pack.id, versionId: pack.versionId, recipient: "known_friend", sender: TAG, message: "", amount: 5 },
      });
      if (created.status !== "created") throw new Error(created.status);
      const r = await svc.lookUpRecipient(created.giftId, SENDER);
      expect(r.status).toBe("resolved");
    });
  });

  describe("the budget for paid X lookups", () => {
    it("uses X while under the daily cap, and falls back to accept-then-fund once it is spent", async () => {
      state.xOnly.set("x_only_friend", { subject: "7020", username: "x_only_friend", name: "X Only" });
      const before = { token: process.env.X_API_BEARER_TOKEN, cap: process.env.GIFT_X_LOOKUPS_PER_DAY };
      process.env.X_API_BEARER_TOKEN = "test-token";
      try {
        const start = async () => {
          const c = await svc.startGift({ senderWallet: SENDER, idempotencyKey: randomUUID(), draft: { packId: pack.id, versionId: pack.versionId, recipient: "x_only_friend", sender: TAG, message: "", amount: 5 } });
          if (c.status !== "created") throw new Error(c.status);
          return c.giftId;
        };
        process.env.GIFT_X_LOOKUPS_PER_DAY = "100000";
        expect((await svc.lookUpRecipient(await start(), SENDER)).status).toBe("resolved");
        process.env.GIFT_X_LOOKUPS_PER_DAY = "0";
        expect((await svc.lookUpRecipient(await start(), SENDER)).status).toBe("needs_acceptance");
      } finally {
        if (before.token === undefined) delete process.env.X_API_BEARER_TOKEN; else process.env.X_API_BEARER_TOKEN = before.token;
        if (before.cap === undefined) delete process.env.GIFT_X_LOOKUPS_PER_DAY; else process.env.GIFT_X_LOOKUPS_PER_DAY = before.cap;
      }
    });
  });
});
