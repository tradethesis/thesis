import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
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
