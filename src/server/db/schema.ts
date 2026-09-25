import {
  bigint,
  customType,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CallHolding, CallSnapshot } from "@/lib/calls";

/**
 * Every on-chain quantity is numeric(39,0), not bigint: a u64 maxes at 1.8e19 and
 * postgres bigint stops at 9.2e18. Carried as a string in TS, converted through one
 * helper to BigInt. Nothing about money is ever a float.
 *
 * Jupiter's inUsdValue / outUsdValue are double precision and are display-only. They
 * never enter P&L, which is computed from confirmed USDC raw deltas alone.
 */
const rawAmount = (name: string) => numeric(name, { precision: 39, scale: 0 });

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** A separate, immutable prediction contract attached to one published research version. */
export const thesisCall = pgTable("thesis_call", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id").notNull().references(() => thesisVersion.id),
  statement: text("statement").notNull(),
  benchmark: text("benchmark").notNull(),
  durationDays: smallint("duration_days").notNull(),
  rules: text("rules").notNull(),
  holdings: jsonb("holdings").$type<CallHolding[]>().notNull(),
  benchmarkHolding: jsonb("benchmark_holding").$type<CallHolding>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  startSnapshot: jsonb("start_snapshot").$type<CallSnapshot>().notNull(),
  latestSnapshot: jsonb("latest_snapshot").$type<CallSnapshot>().notNull(),
  status: text("status").notNull().default("open"),
  lastError: text("last_error"),
  updatedAt,
}, t => [uniqueIndex("thesis_call_version_key").on(t.versionId)]);

/* ------------------------------------------------------------------ assets */

export const asset = pgTable(
  "asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chain: text("chain").notNull().default("solana"),
    mint: text("mint").notNull(),
    kind: text("kind").notNull(), // 'equity_token' | 'quote_currency'
    tokenProgram: text("token_program").notNull(),
    decimals: smallint("decimals").notNull(),
    symbol: text("symbol").notNull(),
    company: text("company").notNull(),
    underlying: text("underlying").notNull(),
    issuer: text("issuer").notNull(),
    issuerPowers: text("issuer_powers").notNull(),
    termsUrl: text("terms_url"),
    extensions: jsonb("extensions").notNull().default(sql`'[]'::jsonb`),
    supportsScaledUi: boolean("supports_scaled_ui").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    /** 'mainnet' | 'fixture'. TH-14: a fixture can never reach a live execution path. */
    network: text("network").notNull().default("mainnet"),
    verificationSource: text("verification_source").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [uniqueIndex("asset_mint_key").on(t.mint), index("asset_enabled_idx").on(t.enabled, t.network)],
);

/* ------------------------------------------------------------------ content */

export const thesis = pgTable(
  "thesis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    authorName: text("author_name").notNull(),
    authorHandle: text("author_handle"),
    authorDisclosure: text("author_disclosure").notNull(),
    /**
     * The wallet that wrote this thesis here, and the only one that can launch or claim from
     * its token. Null for the editorial catalogue, which is correct rather than missing: the
     * desk is not a wallet, nobody is owed its fees, and a thesis with no wallet behind it
     * simply never gets a token.
     */
    creatorWallet: text("creator_wallet"),
    category: text("category").notNull(),
    status: text("status").notNull().default("draft"), // draft|published|under_review|archived
    currentVersionId: uuid("current_version_id"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("thesis_slug_key").on(t.slug), index("thesis_status_idx").on(t.status, t.createdAt)],
);

export const thesisVersion = pgTable(
  "thesis_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => thesis.id, { onDelete: "cascade" }),
    versionNumber: smallint("version_number").notNull(),
    claim: text("claim").notNull(),
    summary: text("summary").notNull(),
    rationale: text("rationale").notNull(),
    counterargument: text("counterargument").notNull(),
    changeMyMind: text("change_my_mind").notNull(),
    horizonLabel: text("horizon_label").notNull(),
    reviewDate: date("review_date"),
    /** [{url,title,source,publishedAt,relevance}] — at least two, enforced on write. */
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    /** sha256 over the canonical JSON of content + constituents. */
    contentHash: text("content_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("thesis_version_number_key").on(t.thesisId, t.versionNumber),
    uniqueIndex("thesis_version_hash_key").on(t.contentHash),
  ],
);

/**
 * Constituents get their own table rather than a JSON blob because `position` is the
 * tie-break input to allocate() and weight bounds need real CHECK constraints.
 */
export const thesisConstituent = pgTable(
  "thesis_constituent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => thesisVersion.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    position: smallint("position").notNull(),
    weightBps: smallint("weight_bps").notNull(),
    exposureRole: text("exposure_role").notNull(),
    /** Why this company benefits if the claim holds. PRD §6 requires it alongside the role. */
    why: text("why").notNull().default(""),
    limitation: text("limitation").notNull(),
    weightRationale: text("weight_rationale"),
  },
  (t) => [
    uniqueIndex("constituent_version_asset_key").on(t.versionId, t.assetId),
    uniqueIndex("constituent_version_position_key").on(t.versionId, t.position),
  ],
);

/* ------------------------------------------------------------------ baskets */

/**
 * The allocation, as a thing with a name.
 *
 * A thesis is an argument; a basket is what the argument says to own. They were one row until
 * now, which is why two different arguments over the identical MSFTx/GOOGLx/AMZNx had no
 * available answer except refusing the second one. Separating them lets several people argue
 * for the same exposure for different reasons, which is what actually happens.
 *
 * `executionVersionId` is the most important column in this file. It is what a buy resolves
 * to. It is written explicitly, once, by an operator action — never inferred from
 * `max(versionNumber)` and never taken from whichever attached thesis happens to be on screen.
 */
export const basket = pgTable(
  "basket",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Two to four words. "AI Infrastructure". The narrative handle, not the claim. */
    name: text("name").notNull(),
    /** One line. What it holds and the exposure — never the argument for it. */
    description: text("description").notNull(),
    category: text("category").notNull(),
    chain: text("chain").notNull().default("solana"),
    /**
     * Who chose the weights — distinct from whoever wrote an argument about them, because N
     * arguments attach to one allocation and only one of them built it. PRODUCT.md keeps these
     * three identities apart everywhere: the poster, the desk, and whose money is at risk.
     */
    allocationAuthorName: text("allocation_author_name").notNull(),
    allocationAuthorHandle: text("allocation_author_handle"),
    allocationAuthorWallet: text("allocation_author_wallet"),
    /** FK declared in constraints.sql as DEFERRABLE — basket and basket_version reference each other. */
    executionVersionId: uuid("execution_version_id"),
    status: text("status").notNull().default("draft"), // draft|live|retired
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("basket_slug_key").on(t.slug), index("basket_status_idx").on(t.status, t.createdAt)],
);

/**
 * One immutable allocation. A re-weight is a new row, never an edit.
 *
 * `allocationKey` is the canonical `mint:bps|…` from src/lib/basket.ts, sorted by code unit.
 * It is written by the application and re-derived from `basket_constituent` by a deferred
 * trigger — two independent implementations that must agree, which is the only good reason to
 * store a derived value at all.
 */
export const basketVersion = pgTable(
  "basket_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    basketId: uuid("basket_id")
      .notNull()
      .references(() => basket.id, { onDelete: "restrict" }),
    versionNumber: smallint("version_number").notNull(),
    chain: text("chain").notNull().default("solana"),
    allocationKey: text("allocation_key").notNull(),
    /** Why the weights moved. Null on v1. */
    changeReason: text("change_reason"),
    /** The allocation's own justification. Belongs here, not on any one argument. */
    weightRationale: text("weight_rationale"),
    /**
     * The performance series for THIS allocation, chosen once. A trigger refuses a call whose
     * frozen holdings are not this exact allocation — that is what stops a real, correct,
     * immutable ninety-day series being displayed under a basket that never earned it.
     */
    callId: uuid("call_id").references(() => thesisCall.id),
    /** 'only_candidate' | 'oldest_of_N' | 'operator'. The choice stays on the record. */
    callSelectionReason: text("call_selection_reason"),
    state: text("state").notNull().default("draft"), // draft|live|superseded
    createdAt,
  },
  (t) => [
    uniqueIndex("basket_version_number_key").on(t.basketId, t.versionNumber),
    // Global, not per-basket: an allocation identity exists once, and an exact match is an
    // association rather than a duplicate. This index is what makes that a fact.
    uniqueIndex("basket_version_allocation_key").on(t.chain, t.allocationKey),
    index("basket_version_basket_idx").on(t.basketId, t.versionNumber),
  ],
);

/**
 * The holdings a buy executes.
 *
 * `mint` is copied from `asset` and frozen. `asset.mint` has no immutability trigger, so a
 * corrected asset row would silently invalidate every allocationKey derived through a join;
 * the frozen copy is the identity, and a trigger checks it still agrees with the asset.
 */
export const basketConstituent = pgTable(
  "basket_constituent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    basketVersionId: uuid("basket_version_id")
      .notNull()
      .references(() => basketVersion.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    mint: text("mint").notNull(),
    position: smallint("position").notNull(),
    weightBps: smallint("weight_bps").notNull(),
  },
  (t) => [
    uniqueIndex("basket_constituent_asset_key").on(t.basketVersionId, t.assetId),
    uniqueIndex("basket_constituent_position_key").on(t.basketVersionId, t.position),
    index("basket_constituent_mint_idx").on(t.mint),
  ],
);

/**
 * An argument attached to an allocation.
 *
 * Unique on `thesisVersionId`: a thesis version states one allocation, so it argues for exactly
 * one basket version. A deferred trigger requires its own `thesis_constituent` rows to hash to
 * that version's allocationKey — the guard that stops the page and the buy describing different
 * baskets.
 */
export const basketThesis = pgTable(
  "basket_thesis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    basketVersionId: uuid("basket_version_id")
      .notNull()
      .references(() => basketVersion.id, { onDelete: "restrict" }),
    thesisVersionId: uuid("thesis_version_id")
      .notNull()
      .references(() => thesisVersion.id, { onDelete: "cascade" }),
    /** 'origin' | 'argument'. The origin's prose decorates the holdings; there is exactly one. */
    role: text("role").notNull().default("argument"),
    attachedAt: timestamp("attached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("basket_thesis_version_key").on(t.thesisVersionId),
    index("basket_thesis_by_basket").on(t.basketVersionId, t.attachedAt),
  ],
);

/**
 * Which allocation was executable between when and when.
 *
 * Append-only, and written by a trigger on `basket.execution_version_id` rather than by
 * application code, so the pointer and its history are the same write and cannot drift. This is
 * the "clearly segmented history" that stops a re-weighted basket appearing to have earned the
 * previous allocation's returns.
 */
export const basketExecutionSpan = pgTable(
  "basket_execution_span",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    basketId: uuid("basket_id")
      .notNull()
      .references(() => basket.id, { onDelete: "restrict" }),
    basketVersionId: uuid("basket_version_id")
      .notNull()
      .references(() => basketVersion.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Null means current. Exactly one open span per basket. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    changeReason: text("change_reason"),
  },
  (t) => [index("basket_span_basket_idx").on(t.basketId, t.startedAt)],
);

export const thesisUpdate = pgTable(
  "thesis_update",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => thesis.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => thesisVersion.id),
    kind: text("kind").notNull(), // evidence|correction|new_version
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    authoredAt: timestamp("authored_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [index("thesis_update_idx").on(t.thesisId, t.authoredAt)],
);

/* ------------------------------------------------------------------ sessions */

export const walletSession = pgTable(
  "wallet_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallet: text("wallet").notNull(),
    nonce: text("nonce").notNull(),
    domain: text("domain").notNull(),
    statement: text("statement").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    state: text("state").notNull().default("challenged"), // challenged|authorized|expired|revoked
    signature: text("signature"),
    signedMessage: text("signed_message"),
    /** sha256 of the opaque cookie token. The token itself is never stored. */
    tokenHash: text("token_hash"),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("wallet_session_nonce_key").on(t.nonce),
    uniqueIndex("wallet_session_token_key").on(t.tokenHash),
    index("wallet_session_wallet_idx").on(t.wallet, t.state),
  ],
);

export const savedThesis = pgTable(
  "saved_thesis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: text("owner_kind").notNull(), // wallet|anon
    ownerKey: text("owner_key").notNull(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => thesis.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [uniqueIndex("saved_thesis_key").on(t.ownerKind, t.ownerKey, t.thesisId)],
);

/* ------------------------------------------------------------------ execution */

export const position = pgTable(
  "position",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallet: text("wallet").notNull(),
    thesisVersionId: uuid("thesis_version_id")
      .notNull()
      .references(() => thesisVersion.id),
    /** The purchaser's own allocation, snapshotted. Never re-read from the version. */
    weightsBps: jsonb("weights_bps").notNull(),
    state: text("state").notNull().default("open"), // open|closing|closed
    attributionState: text("attribution_state").notNull().default("clean"), // clean|under_review
    /** Slot of the FIRST fill. Activity before it is not ours. */
    watchFromSlot: bigint("watch_from_slot", { mode: "bigint" }),
    confirmedCostRaw: rawAmount("confirmed_cost_raw").notNull().default("0"),
    confirmedProceedsRaw: rawAmount("confirmed_proceeds_raw").notNull().default("0"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("position_wallet_idx").on(t.wallet, t.state)],
);

export const positionHolding = pgTable(
  "position_holding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    /** The taker's Token-2022 ATA for this mint: the address the activity scan walks. */
    tokenAccount: text("token_account"),
    acquiredRaw: rawAmount("acquired_raw").notNull().default("0"),
    disposedRaw: rawAmount("disposed_raw").notNull().default("0"),
    lastScannedSignature: text("last_scanned_signature"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("position_holding_key").on(t.positionId, t.assetId)],
);

export const investmentIntent = pgTable(
  "investment_intent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    wallet: text("wallet").notNull(),
    thesisVersionId: uuid("thesis_version_id")
      .notNull()
      .references(() => thesisVersion.id),
    direction: text("direction").notNull(), // buy|sell
    positionId: uuid("position_id").references(() => position.id),
    budgetRaw: rawAmount("budget_raw"),
    inputMint: text("input_mint").notNull(),
    weightsBps: jsonb("weights_bps").notNull(),
    isCustomAllocation: boolean("is_custom_allocation").notNull().default(false),
    /** The exact allocation this buy executes. Mandatory on insert, enforced by a trigger. */
    basketVersionId: uuid("basket_version_id"),
    status: text("status").notNull().default("draft"),
    executionMode: text("execution_mode").notNull(), // live|simulation
    createdAt,
    updatedAt,
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    firstSignedAt: timestamp("first_signed_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("intent_idempotency_key").on(t.idempotencyKey)],
);

export const swapLeg = pgTable(
  "swap_leg",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => investmentIntent.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    legIndex: smallint("leg_index").notNull(),
    inputMint: text("input_mint").notNull(),
    outputMint: text("output_mint").notNull(),
    /** From allocate(). Immutable after creation; every order is checked against it. */
    plannedInRaw: rawAmount("planned_in_raw").notNull(),
    status: text("status").notNull().default("planned"),
    retryOf: uuid("retry_of"),
    attempt: smallint("attempt").notNull().default(1),

    // quote snapshot
    quoteRequestId: text("quote_request_id"),
    quoteOutRaw: rawAmount("quote_out_raw"),
    quoteMinOutRaw: rawAmount("quote_min_out_raw"),
    quoteRouter: text("quote_router"),
    quoteSwapType: text("quote_swap_type"),
    quoteMode: text("quote_mode"),
    quoteSlippageBps: smallint("quote_slippage_bps"),
    quotePriceImpactPct: doublePrecision("quote_price_impact_pct"),
    quoteFeeBps: smallint("quote_fee_bps"),
    quotePlatformFee: jsonb("quote_platform_fee"),
    quoteInUsd: doublePrecision("quote_in_usd"),
    quoteOutUsd: doublePrecision("quote_out_usd"),
    quoteGasless: boolean("quote_gasless"),
    quoteRentLamports: bigint("quote_rent_lamports", { mode: "bigint" }),
    quoteSignatureFeeLamports: bigint("quote_signature_fee_lamports", { mode: "bigint" }),
    quotePriorityFeeLamports: bigint("quote_priority_fee_lamports", { mode: "bigint" }),
    quoteRentPayer: text("quote_rent_payer"),
    quoteSignaturePayer: text("quote_signature_payer"),
    quoteFetchedAt: timestamp("quote_fetched_at", { withTimezone: true }),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),

    // the baseline the user actually reviewed
    reviewedOutRaw: rawAmount("reviewed_out_raw"),
    reviewedMinOutRaw: rawAmount("reviewed_min_out_raw"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    // execution evidence
    transactionB64: text("transaction_b64"),
    signedTransactionB64: text("signed_transaction_b64"),
    messageHash: text("message_hash"),
    recentBlockhash: text("recent_blockhash"),
    feePayer: text("fee_payer"),
    prepareBlockHeight: bigint("prepare_block_height", { mode: "bigint" }),
    /** True when staticAccountKeys[0] === taker, i.e. signatures[0] IS the txid. */
    signatureDerivable: boolean("signature_derivable").notNull().default(false),
    derivedSignature: text("derived_signature"),
    /** The user's own 64-byte signature. Appears verbatim in the landed transaction. */
    takerSignature: text("taker_signature"),
    preflightSlot: bigint("preflight_slot", { mode: "bigint" }),
    providerSignature: text("provider_signature"),
    providerStatus: text("provider_status"),
    providerCode: text("provider_code"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    errorKind: text("error_kind"),
    errorDetail: text("error_detail"),
    reconcileAttempts: smallint("reconcile_attempts").notNull().default(0),
    lastScannedSignature: text("last_scanned_signature"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("swap_leg_attempt_key").on(t.intentId, t.legIndex, t.attempt),
    index("swap_leg_open_idx").on(t.status, t.submittedAt),
  ],
);

export const fill = pgTable(
  "fill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legId: uuid("leg_id").references(() => swapLeg.id),
    intentId: uuid("intent_id").references(() => investmentIntent.id),
    positionId: uuid("position_id").references(() => position.id),
    signature: text("signature").notNull(),
    wallet: text("wallet").notNull(),
    inputMint: text("input_mint").notNull(),
    outputMint: text("output_mint").notNull(),
    inRaw: rawAmount("in_raw").notNull(),
    outRaw: rawAmount("out_raw").notNull(),
    /** 'chain_delta' | 'provider_reported'. Says which, so the fallback is never hidden. */
    amountSource: text("amount_source").notNull(),
    feeLamports: bigint("fee_lamports", { mode: "bigint" }),
    rentLamports: bigint("rent_lamports", { mode: "bigint" }),
    priorityFeeLamports: bigint("priority_fee_lamports", { mode: "bigint" }),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }),
    confirmationStatus: text("confirmation_status").notNull(),
    err: jsonb("err"),
    /** PRD §11 "historical scaling data" — for display, never for money. */
    multiplierAtFill: numeric("multiplier_at_fill", { precision: 20, scale: 10 }),
    createdAt,
  },
  (t) => [uniqueIndex("fill_signature_key").on(t.signature), index("fill_position_idx").on(t.positionId, t.createdAt)],
);

export const externalActivity = pgTable(
  "external_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    signature: text("signature").notNull(),
    slot: bigint("slot", { mode: "bigint" }),
    deltaRaw: rawAmount("delta_raw"),
    direction: text("direction"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("external_activity_key").on(t.positionId, t.signature)],
);

export const valuation = pgTable(
  "valuation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    components: jsonb("components").notNull(),
    /** NULL when incomplete. Never 0 — a zero renders as a worthless position. */
    estimatedProceedsRaw: rawAmount("estimated_proceeds_raw"),
    complete: boolean("complete").notNull(),
    incompleteReason: text("incomplete_reason"),
    oldestComponentAt: timestamp("oldest_component_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("valuation_position_idx").on(t.positionId, t.createdAt)],
);

export const event = pgTable("event", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  name: text("name").notNull(),
  intentId: uuid("intent_id"),
  positionId: uuid("position_id"),
  thesisVersionId: uuid("thesis_version_id"),
  /** No wallet address and no balance ever go in here. PRD §13, §15. */
  anonId: text("anon_id"),
  props: jsonb("props"),
  createdAt,
});

/* ------------------------------------------------------------------ waitlist */

/**
 * People who want in before the doors open.
 *
 * Deliberately small. An email address is enough to tell someone the doors are open, and
 * everything else is optional, because asking for more than you need is how a signup form
 * becomes a reason not to sign up.
 *
 * What is NOT here is the point: no IP address, no user agent, no referrer, no tracking id.
 * PRD §13 keeps wallet identities out of third-party analytics, and the same reasoning
 * applies to an email nobody agreed to be profiled by.
 */
/* ------------------------------------------------------------- convictions */

/**
 * Somebody's side on a thesis: backing it, or doubting it.
 *
 * Free, and deliberately available without a wallet. Every other action in this app needs a
 * SIWS session and Phantom specifically, which means a visitor without that extension can
 * reach nothing at all. A conviction is the one thing anybody can do, so it carries the
 * anonymous/wallet owner pair that saved_thesis already models rather than requiring a key.
 *
 * It is a public record of a view, not a wager: nothing is staked, nothing is paid out.
 *
 * takenAt is the scoring clock and the reason this table exists rather than a column
 * somewhere. A conviction is scored from the first observation at or after it — never from
 * the call's start — so switching sides rewrites this row and resets takenAt, and nobody
 * accrues credit for a stretch they spent on the other side.
 */
export const conviction = pgTable(
  "conviction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thesisId: uuid("thesis_id").notNull(),
    /** The version on screen when the side was taken. */
    versionId: uuid("version_id").notNull(),
    /** Null when the thesis had no running call; such a conviction is never scorable. */
    callId: uuid("call_id"),
    side: text("side").notNull(),
    /** 'wallet' | 'anon', matching saved_thesis. */
    ownerKind: text("owner_kind").notNull(),
    ownerKey: text("owner_key").notNull(),
    /**
     * The basket as it stood at entry, from basketIdentity(). If the thesis is later
     * re-weighted this no longer matches, and the conviction closes against what was
     * actually called instead of being rescored against a different basket.
     */
    basketKey: text("basket_key").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [
    // One live side per person per thesis. Switching rewrites in place.
    uniqueIndex("conviction_one_per_owner").on(t.ownerKind, t.ownerKey, t.thesisId),
    index("conviction_by_thesis").on(t.thesisId),
  ],
);

/* ----------------------------------------------------- call observations */

/**
 * Every quote observation a call has ever had, appended and never updated.
 *
 * thesis_call keeps two snapshots: the fixed start and the most recent. That is all the
 * scoring needs, and it is why no chart of a call's performance could be drawn — each
 * refresh overwrote the only other point that existed, so the entire history was a start
 * and a now.
 *
 * This table exists so the line is real. It is strictly append-only: rows are the record of
 * what was quoted when, and a row that could be edited later would make the chart a claim
 * rather than a record. The call's own start_snapshot stays the authority for scoring, so
 * nothing here can change a result.
 */
export const callObservation = pgTable(
  "call_observation",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    callId: uuid("call_id").notNull(),
    /** When the quotes were taken, not when the row was written. */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** Base units, matching the snapshot they came from. */
    basketUsdcRaw: numeric("basket_usdc_raw", { precision: 39, scale: 0 }).notNull(),
    benchmarkUsdcRaw: numeric("benchmark_usdc_raw", { precision: 39, scale: 0 }).notNull(),
    createdAt,
  },
  (t) => [
    // One row per call per observation time. A retried refresh must not double-plot a point.
    uniqueIndex("call_observation_unique").on(t.callId, t.observedAt),
    index("call_observation_call_time").on(t.callId, t.observedAt),
  ],
);

/* ------------------------------------------------- source post engagement */

/**
 * How a quoted post is doing on X, kept beside the published snapshot rather than inside it.
 *
 * A thesis version is immutable and its evidence snapshot pins the post's text, author and
 * verification time — that is the promise, and it must not move. Engagement is the opposite
 * kind of fact: it changes hourly and says nothing about the argument. Putting it in the
 * snapshot would mean publishing a new version of a thesis every time somebody liked a
 * tweet, which would make the version history meaningless.
 *
 * So it lives here, keyed by the post, refreshed in place, and always rendered with
 * capturedAt — a number without its timestamp is a number that quietly ages into a lie.
 */
export const sourcePostMetrics = pgTable("source_post_metrics", {
  /** The canonical x.com status URL, matching what the evidence snapshot stores. */
  postUrl: text("post_url").primaryKey(),
  likes: integer("likes").notNull(),
  reposts: integer("reposts").notNull(),
  replies: integer("replies").notNull(),
  views: integer("views").notNull(),
  /** When this was read from the mirror. Never rendered without it. */
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
});

export const waitlistSignup = pgTable(
  "waitlist_signup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lowercased and trimmed so one person cannot occupy two places. */
    email: text("email").notNull(),
    /** Optional. Someone who already has a wallet can be let in first. */
    wallet: text("wallet"),
    /** Optional, free text: what they would want a thesis about. */
    note: text("note"),
    /** Which surface they signed up from. A page name, never a tracking id. */
    source: text("source").notNull().default("join"),
    createdAt,
  },
  (t) => [uniqueIndex("waitlist_email_key").on(t.email)],
);

/* --------------------------------------------------- what people search for */

/**
 * Every search the homepage runs, and what it returned.
 *
 * This exists to answer one question the catalogue cannot answer about itself: **what are people
 * looking for that we have no basket for?** A search that finds nothing is the most valuable row
 * in this table — it is a demand signal with the supply gap already named.
 *
 * What is stored is the text somebody typed and the outcome of matching it. What is deliberately
 * *not* stored: no wallet, no session, no IP, no user agent. There is nothing here that ties a
 * search to a person, because answering "what is being researched" needs the what and never the
 * who. Rows are written after the response is already on its way, so a failure to record can
 * never fail a search.
 */
export const matchQuery = pgTable(
  "match_query",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt,
    /** Exactly what was submitted — prose, or the URL if one was pasted. */
    input: text("input").notNull(),
    /** "text" when typed, "post" when a link was retrieved. */
    sourceKind: text("source_kind").notNull(),
    /** The post's canonical URL, when the input was a link we could read. */
    sourceUrl: text("source_url"),
    /** What was actually scored: the retrieved post's text, or the same as `input`. */
    idea: text("idea").notNull(),
    /** How the run ended: ok, unretrievable, unavailable, empty_catalogue. */
    outcome: text("outcome").notNull(),
    /** True when nothing reached Partial. These rows are the catalogue's to-do list. */
    noMatch: boolean("no_match").notNull().default(false),
    /** The best candidate, whether or not it was good enough to be called a match. */
    topSlug: text("top_slug"),
    topStrength: text("top_strength"),
    topScore: numeric("top_score", { precision: 4, scale: 3 }),
    /** Every shown candidate: slug, strength, score, direction. */
    results: jsonb("results").notNull().default([]),
    providerMs: integer("provider_ms"),
    questions: integer("questions"),
  },
  (t) => [
    index("match_query_by_time").on(t.createdAt.desc()),
    // The gap list is read constantly and is a small slice of the table.
    index("match_query_gaps").on(t.createdAt.desc()).where(sql`no_match`),
  ],
);

/* ------------------------------------------------------------ funded gifts */

/**
 * A funded gift and its ledger.
 *
 * Created by src/server/db/migrations/2026-09-23-gifts.sql, which also carries the constraints and
 * triggers that make the state machine hold in the database. They are declared here as well for
 * one reason: drizzle.config.ts has no table filter, so `drizzle-kit push --force` treats any table
 * it does not know about as drift. A financial table must never be one push away from being
 * dropped. Keep the two definitions in step.
 *
 * Design: docs/gifting.md, "Architecture decision · 23 September 2026".
 */
export const gift = pgTable("gift", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteHash: text("invite_hash").notNull().unique(),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }).notNull(),
  state: text("state").notNull().default("draft"),
  packId: text("pack_id").notNull(),
  basketVersionId: uuid("basket_version_id").notNull().references(() => basketVersion.id),
  amountUsd: integer("amount_usd").notNull(),
  amountRaw: numeric("amount_raw", { precision: 20, scale: 0 }).notNull(),
  solAllowanceLamports: bigint("sol_allowance_lamports", { mode: "bigint" }).notNull(),
  senderWallet: text("sender_wallet").notNull(),
  senderName: text("sender_name").notNull(),
  note: text("note").notNull().default(""),
  recipientHandleRequested: text("recipient_handle_requested").notNull(),
  recipientSubject: text("recipient_subject"),
  recipientHandleAtResolution: text("recipient_handle_at_resolution"),
  recipientDisplayName: text("recipient_display_name"),
  recipientProviderUserId: text("recipient_provider_user_id"),
  destinationWallet: text("destination_wallet"),
  fundingSignature: text("funding_signature").unique(),
  fundedSlot: bigint("funded_slot", { mode: "number" }),
  claimedByProviderUserId: text("claimed_by_provider_user_id"),
  claimIntentId: uuid("claim_intent_id").references(() => investmentIntent.id),
  eligibility: text("eligibility").notNull().default("unchecked"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  centerImageId: uuid("center_image_id").references(() => giftImage.id),
});

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** A sender's photo for the middle of a pack. See migrations/2026-09-24-gift-images.sql. */
export const giftImage = pgTable("gift_image", {
  id: uuid("id").primaryKey().defaultRandom(),
  sha256: text("sha256").notNull().unique(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  uploadedByWallet: text("uploaded_by_wallet").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

/** A pack somebody built over their own published thesis: only its name and colour live here. */
export const giftPackDesign = pgTable("gift_pack_design", {
  thesisSlug: text("thesis_slug").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdByWallet: text("created_by_wallet").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const giftEvent = pgTable("gift_event", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  giftId: uuid("gift_id").notNull().references(() => gift.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/*
 * The thesis-token tables stood here: `thesis_token_config` and `thesis_token`, for a paired
 * Meteora bonding-curve token per thesis with 50.4% of its trading fee split to the author.
 * Removed on 22 September 2026 along with the whole feature. Both tables were empty in every
 * environment, so no record and no attribution was lost.
 *
 * `thesis.creatorWallet` deliberately stays: it is the byline, and who a basket's allocation is
 * attributed to. It was never only about fees.
 */
