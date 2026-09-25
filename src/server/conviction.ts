import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  pointsSinceEntry,
  scoreConviction,
  type ConvictionScore,
  type Side,
} from "@/lib/conviction";

import { basketKey } from "@/lib/calls";
import { USDC_MINT } from "./assets/allowlist";

import { loadSeries, type SeriesPoint } from "./calls/observations";

import { db } from "./db/client";
import { asset, conviction, thesis, thesisCall, thesisConstituent, thesisVersion } from "./db/schema";

/**
 * Reading and writing somebody's side on a thesis.
 *
 * The owner is always passed in by the route, which takes it from the session or the anon
 * header — never from the request body. An endpoint that accepts an owner as a parameter is
 * an endpoint that writes and reads anybody's record for whoever asks, and it always starts
 * as a convenience.
 */

export type Owner = { kind: "wallet" | "anon"; key: string };

export type StoredConviction = {
  thesisId: string;
  versionId: string;
  callId: string | null;
  side: Side;
  basketKey: string;
  takenAt: string;
  slug: string;
  claim: string;
};

/** Bounds match the CHECK on the column, so a bad key is refused before it reaches Postgres. */
const OWNER_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidOwner(owner: Owner | null): owner is Owner {
  return Boolean(owner && (owner.kind === "wallet" || owner.kind === "anon") && OWNER_KEY.test(owner.key));
}

/**
 * Take or switch a side.
 *
 * Switching rewrites the row and resets takenAt, so the scoring window restarts. That is
 * the point rather than a side effect: somebody who flips after a bad week should not keep
 * the credit from the good one.
 */
export async function takeSide(owner: Owner, thesisId: string, side: Side): Promise<StoredConviction | null> {
  const [version] = await db
    .select({
      versionId: thesisVersion.id,
      thesisId: thesis.id,
      slug: thesis.slug,
      claim: thesisVersion.claim,
    })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(and(eq(thesis.id, thesisId), eq(thesis.status, "published")));

  if (!version) return null;

  // The basket as it stands right now, so a later re-weighting cannot change what this
  // person is recorded as having called.
  const basketKey = await basketKeyFor(version.versionId);
  const callId = await callIdFor(version.thesisId, basketKey);

  const takenAt = new Date();
  await db
    .insert(conviction)
    .values({
      thesisId: version.thesisId,
      versionId: version.versionId,
      callId,
      side,
      ownerKind: owner.kind,
      ownerKey: owner.key,
      basketKey,
      takenAt,
    })
    .onConflictDoUpdate({
      target: [conviction.ownerKind, conviction.ownerKey, conviction.thesisId],
      set: { side, versionId: version.versionId, callId, basketKey, takenAt },
    });

  return {
    thesisId: version.thesisId,
    versionId: version.versionId,
    callId,
    side,
    basketKey,
    takenAt: takenAt.toISOString(),
    slug: version.slug,
    claim: version.claim,
  };
}

export async function clearSide(owner: Owner, thesisId: string): Promise<void> {
  await db
    .delete(conviction)
    .where(
      and(
        eq(conviction.ownerKind, owner.kind),
        eq(conviction.ownerKey, owner.key),
        eq(conviction.thesisId, thesisId),
      ),
    );
}

export async function listForOwner(owner: Owner): Promise<StoredConviction[]> {
  const rows = await db
    .select({
      thesisId: conviction.thesisId,
      versionId: conviction.versionId,
      callId: conviction.callId,
      side: conviction.side,
      basketKey: conviction.basketKey,
      takenAt: conviction.takenAt,
      slug: thesis.slug,
      claim: thesisVersion.claim,
    })
    .from(conviction)
    .innerJoin(thesis, eq(conviction.thesisId, thesis.id))
    .innerJoin(thesisVersion, eq(conviction.versionId, thesisVersion.id))
    .where(and(eq(conviction.ownerKind, owner.kind), eq(conviction.ownerKey, owner.key)))
    .orderBy(desc(conviction.takenAt));

  return rows.map((r) => ({ ...r, side: r.side as Side, takenAt: r.takenAt.toISOString() }));
}

/**
 * How many people have taken each side, per thesis.
 *
 * Returned as raw counts, never as a percentage. Whether a split is fit to show is decided
 * by crowdSplit() against its floor, and the caller always renders the count beside it.
 *
 * Every row is counted, including sides taken on development fixtures. The number has to be
 * true about people, not about theses: a fixture thesis on the feed is one a real visitor
 * can really call, and hiding their tap would make the count a lie in the other direction.
 * What keeps this honest is upstream — no seed script may ever write a conviction row.
 */
export async function countsForTheses(thesisIds: string[]): Promise<Map<string, { backing: number; doubting: number }>> {
  if (!thesisIds.length) return new Map();

  const rows = await db
    .select({
      thesisId: conviction.thesisId,
      side: conviction.side,
      n: sql<number>`count(*)::int`,
    })
    .from(conviction)
    .where(inArray(conviction.thesisId, thesisIds))
    .groupBy(conviction.thesisId, conviction.side);

  const out = new Map<string, { backing: number; doubting: number }>();
  for (const r of rows) {
    const entry = out.get(r.thesisId) ?? { backing: 0, doubting: 0 };
    if (r.side === "backing") entry.backing = r.n;
    else entry.doubting = r.n;
    out.set(r.thesisId, entry);
  }
  return out;
}

/**
 * The call this basket is running under, if any.
 *
 * Matched on the thesis and the basket rather than on the version id, the same way the feed
 * card matches one. A call is struck against a single version, so a later prose-only edit
 * publishes a new version and a version-id lookup would find nothing — leaving a conviction
 * permanently unscorable against a call that is in fact still running on the same basket.
 */
async function callIdFor(thesisId: string, key: string): Promise<string | null> {
  const rows = await db
    .select({ id: thesisCall.id, holdings: thesisCall.holdings })
    .from(thesisCall)
    .innerJoin(thesisVersion, eq(thesisCall.versionId, thesisVersion.id))
    .where(eq(thesisVersion.thesisId, thesisId));

  const match = rows.find((r) => basketKey(r.holdings as { mint: string; weightBps: number }[]) === key);
  return match?.id ?? null;
}

/**
 * The basket identity of a version: its mints and weights, order-independent.
 *
 * `COLLATE "C"` is not decoration. This string is compared against `basketKey()` in
 * src/lib/basket.ts, which sorts in JavaScript by code unit. Postgres sorts by the database
 * collation, which on this database is case-insensitive — and base58 mints are mixed case, so
 * the two orders disagree on 21 of the catalogue's 68 versions. A disagreement here is silent:
 * `basketChanged` goes true, the conviction closes out unscored, and the standings quietly
 * empty. Measured 21 September 2026.
 */
async function basketKeyFor(versionId: string): Promise<string> {
  const rows = await db.execute<{ key: string }>(sql`
    select coalesce(string_agg(a.mint || ':' || c.weight_bps, '|' order by a.mint collate "C"), '') as key
    from thesis_constituent c
    join asset a on a.id = c.asset_id
    where c.version_id = ${versionId}
  `);
  return rows[0]?.key ?? "";
}

/* ------------------------------------------------- scoring somebody's record */

export type ScoredConviction = StoredConviction & {
  score: ConvictionScore;
  /** Only the observations at or after entry, ready to plot. */
  points: SeriesPoint[];
};

/**
 * Every side this owner has taken, scored forward from the moment they took it.
 *
 * Scoring lives here rather than on the card because the card cannot afford it: the feed
 * shows fifty theses and loading fifty observation series to decorate them would be a
 * query per card. An owner's own convictions are a much smaller set — however many sides
 * one person has taken — so the whole record is scored in three queries and the feed reads
 * the answer out of the same response it already fetches.
 */
export async function scoredForOwner(owner: Owner): Promise<ScoredConviction[]> {
  const rows = await listForOwner(owner);
  if (!rows.length) return [];

  const callIds = [...new Set(rows.map((r) => r.callId).filter((id): id is string => Boolean(id)))];
  const [series, current] = await Promise.all([loadSeries(callIds), currentBasketKeys(rows.map((r) => r.thesisId))]);

  return rows.map((row) => {
    const points = row.callId ? (series.get(row.callId) ?? []) : [];
    const live = current.get(row.thesisId);
    // Only close it when we positively know the basket moved. A thesis with no readable
    // basket right now is a gap in our data, not evidence against the person who called it.
    const basketChanged = live !== undefined && live !== row.basketKey;

    return {
      ...row,
      score: scoreConviction(points, row.takenAt, row.side, { basketChanged, hasCall: row.callId !== null }),
      points: basketChanged ? [] : pointsSinceEntry(points, row.takenAt),
    };
  });
}

/** The basket each thesis carries *now*, to compare against the one that was called. */
async function currentBasketKeys(thesisIds: string[]): Promise<Map<string, string>> {
  if (!thesisIds.length) return new Map();
  const rows = await db
    .select({
      thesisId: thesis.id,
      // collate "C" for the same reason as basketKeyFor above: this is compared against a
      // key sorted in JavaScript, and the database's own collation sorts differently.
      key: sql<string>`coalesce(string_agg(${asset.mint} || ':' || ${thesisConstituent.weightBps}, '|' order by ${asset.mint} collate "C"), '')`,
    })
    .from(thesis)
    .innerJoin(thesisConstituent, eq(thesisConstituent.versionId, thesis.currentVersionId))
    .innerJoin(asset, eq(asset.id, thesisConstituent.assetId))
    .where(inArray(thesis.id, thesisIds))
    .groupBy(thesis.id);

  return new Map(rows.map((r) => [r.thesisId, r.key]));
}

/* ------------------------------------------------- the crowd, per thesis */

export type CrowdStanding = {
  thesisId: string;
  slug: string;
  claim: string;
  backing: number;
  doubting: number;
  total: number;
  /** Each call scored from its own entry, then counted. Never a single basket number. */
  ahead: number;
  behind: number;
  level: number;
  scorable: number;
};

/**
 * How the crowd is doing on each thesis they have called.
 *
 * Deliberately not a ranking of people. Every owner here is an anonymous browser id or a
 * wallet address; putting those in a table would publish a list of identifiers and rank
 * them, which is a privacy problem dressed as a scoreboard, and a name somebody chose would
 * be an account system this product does not have.
 *
 * So the crowd is shown per belief, which is the thing a reader actually wants to know:
 * how many people called this, which way, and how those calls are going. Each call is
 * scored from its own entry by the same forward-only rule as a personal record — a single
 * basket-versus-benchmark figure would silently grade everybody from the call's start.
 */
export async function crowdStandings(): Promise<CrowdStanding[]> {
  const rows = await db
    .select({
      thesisId: conviction.thesisId,
      callId: conviction.callId,
      side: conviction.side,
      takenAt: conviction.takenAt,
      basketKey: conviction.basketKey,
      slug: thesis.slug,
      claim: thesisVersion.claim,
    })
    .from(conviction)
    .innerJoin(thesis, eq(conviction.thesisId, thesis.id))
    .innerJoin(thesisVersion, eq(thesis.currentVersionId, thesisVersion.id))
    .where(eq(thesis.status, "published"));

  if (!rows.length) return [];

  const callIds = [...new Set(rows.map((r) => r.callId).filter((id): id is string => Boolean(id)))];
  const [series, current] = await Promise.all([
    loadSeries(callIds),
    currentBasketKeys([...new Set(rows.map((r) => r.thesisId))]),
  ]);

  const byThesis = new Map<string, CrowdStanding>();
  for (const row of rows) {
    const standing = byThesis.get(row.thesisId) ?? {
      thesisId: row.thesisId,
      slug: row.slug,
      claim: row.claim,
      backing: 0,
      doubting: 0,
      total: 0,
      ahead: 0,
      behind: 0,
      level: 0,
      scorable: 0,
    };

    standing.total += 1;
    if (row.side === "backing") standing.backing += 1;
    else standing.doubting += 1;

    const live = current.get(row.thesisId);
    const { status } = scoreConviction(
      row.callId ? (series.get(row.callId) ?? []) : [],
      row.takenAt.toISOString(),
      row.side as Side,
      { basketChanged: live !== undefined && live !== row.basketKey, hasCall: row.callId !== null },
    );
    if (status === "ahead") standing.ahead += 1;
    else if (status === "behind") standing.behind += 1;
    else if (status === "level") standing.level += 1;

    standing.scorable = standing.ahead + standing.behind + standing.level;
    byThesis.set(row.thesisId, standing);
  }

  // Most-called first. Ties broken by how many of those calls have actually been scored,
  // so a belief with real results outranks one with the same headcount and nothing measured.
  return [...byThesis.values()].sort((a, b) => b.total - a.total || b.scorable - a.scorable);
}

/* ------------------------------------------------- what a thesis has attracted */

export type ThesisActivity = {
  /** How many people have taken a side. Real rows, never seeded. */
  calls: number;
  /** USDC actually spent through this app on live purchases. Simulations never count. */
  volumeUsdc: number;
  buyers: number;
};

/**
 * Real activity per thesis, for the rails.
 *
 * Volume counts confirmed fills on intents whose execution mode is `live` — money that
 * actually left a wallet. Simulated runs are excluded and that is the whole point of the
 * function: there are eleven intents in development and every one of them is a simulation,
 * so a naive `sum(budget)` would put a few hundred dollars of "volume" on the feed that
 * nobody ever spent. A figure that is only true in development is worse than no figure.
 */
export async function activityForTheses(thesisIds: string[]): Promise<Map<string, ThesisActivity>> {
  if (!thesisIds.length) return new Map();

  const out = new Map<string, ThesisActivity>();
  for (const id of thesisIds) out.set(id, { calls: 0, volumeUsdc: 0, buyers: 0 });

  const counts = await countsForTheses(thesisIds);
  for (const [id, c] of counts) {
    const entry = out.get(id);
    if (entry) entry.calls = c.backing + c.doubting;
  }

  const spend = await db.execute<{ thesis_id: string; usdc: string; buyers: string }>(sql`
    select v.thesis_id,
           coalesce(sum(f.in_raw), 0)::text as usdc,
           count(distinct f.wallet)::text as buyers
    from fill f
    join investment_intent i on i.id = f.intent_id
    join thesis_version v on v.id = i.thesis_version_id
    where i.execution_mode = 'live'
      and f.input_mint = ${USDC_MINT}
      and v.thesis_id in ${thesisIds.length ? sql.raw(`('${thesisIds.join("','")}')`) : sql.raw("(null)")}
    group by v.thesis_id
  `);

  for (const row of spend) {
    const entry = out.get(row.thesis_id);
    if (!entry) continue;
    entry.volumeUsdc = Number(row.usdc) / 1e6;
    entry.buyers = Number(row.buyers);
  }

  return out;
}
