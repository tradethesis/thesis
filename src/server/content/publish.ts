import { createHash } from "node:crypto";
import { and, eq, like, ne, not } from "drizzle-orm";
import { db } from "../db/client";

/** The transaction handle, or the pool when there is no transaction in flight. */
type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];
import {
  asset,
  basket,
  basketConstituent,
  basketThesis,
  basketVersion,
  thesis,
  thesisConstituent,
  thesisVersion,
} from "../db/schema";
import { THESES, AUTHOR, type ThesisSeed } from "./theses";
import { EVIDENCE, MIN_EVIDENCE_LINKS, type EvidenceLink } from "./evidence";
import { CURATED_THESES, CURATED_EVIDENCE, type CuratedEvidence } from "./curated";
import { BASKET_NAMES } from "./baskets";
import { validateAllocation } from "@/lib/money/allocate";
import { allocationKey, classifyAllocation, type ExistingBasket } from "@/lib/basket";

/**
 * Publish the catalogue.
 *
 * A published version is immutable — the database enforces that with a trigger — so this
 * validates hard before writing rather than fixing things afterwards. Re-running it
 * creates a NEW version when content changed and does nothing when it did not, which is
 * what the content hash is for.
 */

export class ContentError extends Error {}

/**
 * Editorial theses and curated ones are published by the same pipeline and validated by the
 * same gates. They are kept in separate files so that adding a curated entry never edits
 * evidence.ts or theses.ts, which hold sources already verified.
 */
export const ALL_SEEDS: ThesisSeed[] = [...THESES, ...CURATED_THESES];

export function evidenceFor(slug: string): CuratedEvidence[] {
  return CURATED_EVIDENCE[slug] ?? EVIDENCE[slug] ?? [];
}

/** Canonical JSON over the fields a reader would call "the thesis". Order is fixed. */
export function contentHash(seed: ThesisSeed, evidence: EvidenceLink[]): string {
  const canonical = JSON.stringify({
    claim: seed.claim,
    summary: seed.summary,
    rationale: seed.rationale,
    counterargument: seed.counterargument,
    changeMyMind: seed.changeMyMind,
    horizonLabel: seed.horizonLabel,
    reviewDate: seed.reviewDate,
    weightRationale: seed.weightRationale,
    constituents: seed.constituents
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ symbol: c.symbol, position: c.position, weightBps: c.weightBps, role: c.role, why: c.why, limitation: c.limitation })),
    evidence: evidence.map((e) => {
      const post = (e as CuratedEvidence).sourcePost;
      return {
        url: e.url,
        title: e.title,
        source: e.source,
        publishedAt: e.publishedAt,
        relevance: e.relevance,
        // Present only for curated entries. Adding an absent key would change every
        // existing hash and orphan the versions already published against them.
        ...(post
          ? {
              sourcePost: {
                url: post.url,
                author: post.author,
                handle: post.handle,
                text: post.text,
                postedAt: post.postedAt,
                verifiedAt: post.verifiedAt,
              },
            }
          : {}),
      };
    }),
  });
  return createHash("sha256").update(canonical).digest("hex");
}


/**
 * The identity of a basket: which symbols, at which weights, order-independent.
 *
 * Two theses that buy exactly the same thing are one product with two headlines. It is the
 * failure this catalogue actually had — "nobody knows who is liable for AI" and "spending a
 * trillion is the easy part" argued different things and shipped the identical
 * MSFTx 34 / GOOGLx 33 / AMZNx 33 — and nothing anywhere noticed.
 */
export function basketIdentity(constituents: { symbol: string; weightBps: number }[]): string {
  return constituents
    .map((c) => `${c.symbol}:${c.weightBps}`)
    .sort()
    .join("|");
}

/**
 * Refuse a basket that is a near-miss of one that already exists.
 *
 * This used to refuse the *exact* duplicate outright: "two theses that buy exactly the same
 * thing are one thesis". The diagnosis was right and the remedy was wrong. A reader choosing
 * between two entries that buy the identical thing is not choosing between two products — but
 * the answer to that is one basket carrying both arguments, which is what `basket` now is, not
 * one of the arguments deleted.
 *
 * What survives is the part the old rule was really protecting. A one-percent nudge to dodge the
 * check produces the same indistinguishable pair while looking compliant, so a near-miss is
 * still refused. Only a re-weight large enough to change which holding the argument leans on
 * makes a genuinely separate basket.
 *
 * Symbols are the key here rather than mints, because this runs before symbols have been
 * resolved against the asset table — it is an input check on a seed. The real association, in
 * mint space, happens in `publishSeed` once resolution has taken place.
 */
export function assertBasketIsDistinct(
  seed: ThesisSeed,
  published: { slug: string; constituents: { symbol: string; weightBps: number }[] }[],
): void {
  const result = classifyAllocation(
    seed.constituents.map((c) => ({ mint: c.symbol, weightBps: c.weightBps })),
    published
      .filter((p) => p.slug !== seed.slug)
      .map((p) => ({
        basketId: p.slug,
        basketVersionId: p.slug,
        slug: p.slug,
        name: p.slug,
        holdings: p.constituents.map((c) => ({ mint: c.symbol, weightBps: c.weightBps })),
      })),
  );

  if (result.kind === "too_similar") {
    throw new ContentError(
      `${seed.slug}: this basket is ${result.turnoverBps / 100} percentage points away from ` +
        `${result.basket.slug} — close enough that a reader could not tell them apart. Either ` +
        `hold the same allocation and attach this argument to that basket, or change the weights ` +
        `enough to say something different about which holding it leans on.`,
    );
  }
}

export function validateSeed(seed: ThesisSeed, evidence: EvidenceLink[], allowUnsourced: boolean): void {
  validateAllocation(
    seed.constituents.map((c) => ({ assetId: c.symbol, positionIndex: c.position, bps: c.weightBps })),
  );

  const unequal = new Set(seed.constituents.map((c) => c.weightBps)).size > 1;
  const equalDefault = seed.constituents.every((c) => c.weightBps === 3400 || c.weightBps === 3300);
  if (unequal && !equalDefault && !seed.weightRationale) {
    throw new ContentError(`${seed.slug}: unequal weights need a stated reason (PRD §6)`);
  }

  for (const c of seed.constituents) {
    if (!c.role.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a role`);
    if (!c.why.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a stated case`);
    if (!c.limitation.trim()) throw new ContentError(`${seed.slug}/${c.symbol}: every holding needs a limitation`);
  }
  if (!seed.counterargument.trim()) throw new ContentError(`${seed.slug}: needs a counterargument`);
  if (!seed.changeMyMind.trim()) throw new ContentError(`${seed.slug}: needs a change-my-mind condition`);

  if (evidence.length < MIN_EVIDENCE_LINKS && !allowUnsourced) {
    throw new ContentError(
      `${seed.slug}: has ${evidence.length} evidence links, needs ${MIN_EVIDENCE_LINKS}. ` +
        `Set ALLOW_UNSOURCED_SEED=1 to publish anyway for local development only.`,
    );
  }
}

/**
 * Who a thesis is attributed to, and who gets paid by its token.
 *
 * Two different things, kept apart on purpose. `name`/`handle`/`disclosure` are a snapshot of
 * the display identity at publish time — if somebody later renames themselves, every old
 * attribution does not silently rewrite. `creatorWallet` is the key a token's fees route to,
 * and it is the only one of the four that decides where money goes.
 */
export type Attribution = {
  name: string;
  handle: string | null;
  disclosure: string;
  /** Null for the editorial catalogue. A thesis with no wallet behind it never gets a token. */
  creatorWallet: string | null;
};

export const EDITORIAL: Attribution = { ...AUTHOR, creatorWallet: null };

/**
 * Every published basket, for the distinctness check.
 *
 * Read from the database rather than from the seed files, because a user-submitted thesis has
 * to be checked against everything already live, not against the ten entries that happen to be
 * in `ALL_SEEDS`. `assertBasketIsDistinct` stays the friendly error; this is what makes it true
 * of the catalogue rather than of one run.
 */
export async function publishedBaskets(): Promise<
  { slug: string; constituents: { symbol: string; weightBps: number }[] }[]
> {
  const rows = await db
    .select({ slug: thesis.slug, symbol: asset.symbol, weightBps: thesisConstituent.weightBps })
    .from(thesis)
    .innerJoin(thesisVersion, eq(thesisVersion.id, thesis.currentVersionId))
    .innerJoin(thesisConstituent, eq(thesisConstituent.versionId, thesisVersion.id))
    .innerJoin(asset, eq(asset.id, thesisConstituent.assetId))
    .where(
      and(
        eq(thesis.status, "published"),
        // Development fixtures are excluded, on two independent predicates.
        //
        // They are written by direct insert in scripts/seed-dev-feed.ts and never cleared a
        // publish gate, they all share the weights [3400,3300,3300] over a rotating pick, and
        // there are fifty of them. Including them here meant a real thesis being refused for
        // resembling `fixture-1-software-margins-compress` — which is exactly what happened the
        // first time this ran. A fixture must never occupy an allocation identity.
        not(like(thesis.slug, "fixture-%")),
        ne(thesis.authorName, "Thesis fixtures"),
      ),
    );

  const bySlug = new Map<string, { symbol: string; weightBps: number }[]>();
  for (const row of rows) {
    const list = bySlug.get(row.slug) ?? [];
    list.push({ symbol: row.symbol, weightBps: row.weightBps });
    bySlug.set(row.slug, list);
  }
  return [...bySlug].map(([slug, constituents]) => ({ slug, constituents }));
}

/**
 * Every live basket, with the allocation it executes.
 *
 * One query, not one per basket. `listPublishedTheses` still runs a holdings query inside a loop
 * and costs sixty round trips to render the catalogue; nothing new should copy that.
 */
export async function liveBaskets(tx: Db): Promise<ExistingBasket[]> {
  const rows = await tx
    .select({
      basketId: basket.id,
      basketVersionId: basketVersion.id,
      slug: basket.slug,
      name: basket.name,
      mint: basketConstituent.mint,
      weightBps: basketConstituent.weightBps,
    })
    .from(basket)
    .innerJoin(basketVersion, eq(basketVersion.id, basket.executionVersionId))
    .innerJoin(basketConstituent, eq(basketConstituent.basketVersionId, basketVersion.id))
    .where(eq(basket.status, "live"));

  const byId = new Map<string, ExistingBasket>();
  for (const row of rows) {
    const found = byId.get(row.basketId) ?? {
      basketId: row.basketId,
      basketVersionId: row.basketVersionId,
      slug: row.slug,
      name: row.name,
      holdings: [],
    };
    found.holdings.push({ mint: row.mint, weightBps: row.weightBps });
    byId.set(row.basketId, found);
  }
  return [...byId.values()];
}

/** A basket slug nothing else is using. Derived from the name, never from the thesis slug. */
async function freeBasketSlug(tx: Db, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "basket";
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const [taken] = await tx.select({ id: basket.id }).from(basket).where(eq(basket.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new ContentError(`too many baskets are already called something like "${name}"`);
}

export type PublishResult = {
  slug: string;
  action: "created" | "new_version" | "unchanged" | "attached";
  version: number;
  basketVersionId?: string;
};

/**
 * Publish one thesis, through every gate the catalogue goes through.
 *
 * Extracted from `publishAll` so a user submission cannot take a shortcut around the rules: a
 * second write path would be a second set of rules, and the whole point of the gates is that
 * everything on the site cleared the same ones.
 *
 * `status` lets a caller land a submission in `under_review` instead of `published`. The
 * version row is still written and still immutable; what changes is whether anybody sees it.
 */
export async function publishSeed(
  seed: ThesisSeed,
  evidence: EvidenceLink[],
  options: {
    attribution?: Attribution;
    allowUnsourced?: boolean;
    status?: "published" | "under_review";
    /** Already-published baskets to check against. Read from the database when omitted. */
    against?: { slug: string; constituents: { symbol: string; weightBps: number }[] }[];
    /** Required when the allocation is new. Ignored when it attaches to an existing basket. */
    basket?: { name: string; description: string };
    /** The basket this author already owns, so re-weighting their own does not trip the near-miss rule. */
    ownBasketId?: string;
  } = {},
): Promise<PublishResult> {
  const attribution = options.attribution ?? EDITORIAL;
  const status = options.status ?? "published";

  validateSeed(seed, evidence, options.allowUnsourced ?? false);
  assertBasketIsDistinct(seed, options.against ?? (await publishedBaskets()));

  /*
   * One transaction, because the guards that check this work are deferred.
   *
   * A DEFERRABLE INITIALLY DEFERRED constraint trigger fires at COMMIT. For a bare statement
   * that is immediately, so a sequence of standalone inserts gets checked between each one,
   * when the version exists and its constituents do not. Half-written work is exactly the
   * state those triggers are meant to tolerate inside a transaction and reject at its edge.
   *
   * It also closes a real hole that predates them: a failure partway through used to leave a
   * thesis row whose currentVersionId pointed at nothing.
   */
  return db.transaction(async (tx) => {
  // Resolve every constituent against the verified asset table. A symbol that is not
  // there, or is not enabled, cannot be published — TH-05 at the content boundary.
  const assetIds = new Map<string, string>();
  const mints = new Map<string, string>();
  for (const c of seed.constituents) {
    const rows = await tx
      .select({ id: asset.id, enabled: asset.enabled, mint: asset.mint })
      .from(asset)
      .where(and(eq(asset.symbol, c.symbol), eq(asset.network, "mainnet")));
    if (!rows.length) throw new ContentError(`${seed.slug}: ${c.symbol} is not in the asset table`);
    if (!rows[0].enabled) throw new ContentError(`${seed.slug}: ${c.symbol} is not enabled for trading`);
    assetIds.set(c.symbol, rows[0].id);
    mints.set(c.symbol, rows[0].mint);
  }

  // Mint space from here on. Everything above was an input check on symbols a person typed;
  // this is the identity the money uses, and the two are not interchangeable — asset.symbol has
  // no unique index because a development fixture may legitimately carry a real ticker.
  const holdings = seed.constituents.map((c) => ({ mint: mints.get(c.symbol)!, weightBps: c.weightBps }));

  const hash = contentHash(seed, evidence);

  const existingThesis = await tx.select().from(thesis).where(eq(thesis.slug, seed.slug));
  let thesisId: string;
  let action: "created" | "new_version" | "unchanged" = "created";

  if (existingThesis.length) {
    thesisId = existingThesis[0].id;
    // Title and category live on the thesis, not the version, so they are not covered by the
    // content hash and have to be refreshed on every run.
    //
    // The author fields are refreshed only for the editorial catalogue. Rewriting them
    // unconditionally — which this did until 19 September 2026 — turns every user-authored
    // thesis into "Thesis editorial" on the next `pnpm content:publish`, silently, and takes
    // the byline off the person whose token is paying them.
    const ownedByAUser = Boolean(existingThesis[0].creatorWallet);
    await tx
      .update(thesis)
      .set({
        title: seed.title,
        category: seed.category,
        ...(ownedByAUser
          ? {}
          : {
              authorName: attribution.name,
              authorHandle: attribution.handle,
              authorDisclosure: attribution.disclosure,
            }),
        updatedAt: new Date(),
      })
      .where(eq(thesis.id, thesisId));

    const same = await tx
      .select({ id: thesisVersion.id, n: thesisVersion.versionNumber })
      .from(thesisVersion)
      .where(and(eq(thesisVersion.thesisId, thesisId), eq(thesisVersion.contentHash, hash)));
    if (same.length) return { slug: seed.slug, action: "unchanged", version: same[0].n };
    action = "new_version";
  } else {
    const [row] = await tx
      .insert(thesis)
      .values({
        slug: seed.slug,
        title: seed.title,
        authorName: attribution.name,
        authorHandle: attribution.handle,
        authorDisclosure: attribution.disclosure,
        creatorWallet: attribution.creatorWallet,
        category: seed.category,
        status,
      })
      .returning({ id: thesis.id });
    thesisId = row.id;
  }

  const prior = await tx
    .select({ n: thesisVersion.versionNumber })
    .from(thesisVersion)
    .where(eq(thesisVersion.thesisId, thesisId));
  const versionNumber = prior.reduce((max, r) => Math.max(max, r.n), 0) + 1;

  const [version] = await tx
    .insert(thesisVersion)
    .values({
      thesisId,
      versionNumber,
      claim: seed.claim,
      summary: seed.summary,
      rationale: seed.rationale,
      counterargument: seed.counterargument,
      changeMyMind: seed.changeMyMind,
      horizonLabel: seed.horizonLabel,
      reviewDate: seed.reviewDate,
      evidence,
      contentHash: hash,
      // A submission under review has a version row, and that row is not published until a
      // person publishes it. Null here is what keeps it off every listing.
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning({ id: thesisVersion.id });

  // Constituents are written before the version is pointed at, because the immutability
  // trigger refuses to touch them once the version they belong to is published... and it
  // is already published. So they go in within the same statement batch, and the trigger
  // is what stops a later edit.
  for (const c of seed.constituents) {
    await tx.insert(thesisConstituent).values({
      versionId: version.id,
      assetId: assetIds.get(c.symbol)!,
      position: c.position,
      weightBps: c.weightBps,
      exposureRole: c.role,
      why: c.why,
      limitation: c.limitation,
      weightRationale: c.position === 0 ? seed.weightRationale : null,
    });
  }

  await tx
    .update(thesis)
    .set({ currentVersionId: version.id, status, updatedAt: new Date() })
    .where(eq(thesis.id, thesisId));

  /*
   * Give the argument a basket.
   *
   * An exact allocation match attaches to whatever basket already holds it, which is the case
   * that used to be refused outright. Anything else creates one. The near-miss case threw long
   * before we got here.
   *
   * The attachment is checked by a deferred trigger against this version's own constituents, so
   * a page that rendered one allocation while the buy path built another is not representable.
   */
  const existing = await liveBaskets(tx);
  const resolution = classifyAllocation(holdings, existing, { ownBasketId: options.ownBasketId });

  let basketVersionId: string;
  let attached = false;

  if (resolution.kind === "attach") {
    basketVersionId = resolution.basket.basketVersionId;
    attached = !resolution.mine;
  } else {
    const meta = options.basket;
    if (!meta) {
      throw new ContentError(
        `${seed.slug}: this allocation has no basket yet, so publishing it needs a basket name ` +
          `and a one-line description. Pass them, or attach the argument to an existing basket.`,
      );
    }
    const [b] = await tx
      .insert(basket)
      .values({
        slug: await freeBasketSlug(tx, meta.name),
        name: meta.name,
        description: meta.description,
        category: seed.category,
        allocationAuthorName: attribution.name,
        allocationAuthorHandle: attribution.handle,
        allocationAuthorWallet: attribution.creatorWallet,
        status: "draft",
      })
      .returning({ id: basket.id });

    const [bv] = await tx
      .insert(basketVersion)
      .values({
        basketId: b.id,
        versionNumber: 1,
        allocationKey: allocationKey(holdings),
        weightRationale: seed.weightRationale,
        state: "live",
      })
      .returning({ id: basketVersion.id });

    for (const c of seed.constituents) {
      await tx.insert(basketConstituent).values({
        basketVersionId: bv.id,
        assetId: assetIds.get(c.symbol)!,
        mint: mints.get(c.symbol)!,
        position: c.position,
        weightBps: c.weightBps,
      });
    }

    // Last, and explicitly: this is the column a buy resolves to.
    await tx
      .update(basket)
      .set({ status: "live", executionVersionId: bv.id, updatedAt: new Date() })
      .where(eq(basket.id, b.id));

    basketVersionId = bv.id;
  }

  const [origin] = await tx
    .select({ id: basketThesis.id })
    .from(basketThesis)
    .where(and(eq(basketThesis.basketVersionId, basketVersionId), eq(basketThesis.role, "origin")))
    .limit(1);

  await tx
    .insert(basketThesis)
    .values({
      basketVersionId,
      thesisVersionId: version.id,
      role: origin ? "argument" : "origin",
    })
    .onConflictDoNothing({ target: basketThesis.thesisVersionId });

  // "attached" is a visible outcome, not a silent success. Joining a basket somebody else built
  // is a thing an author is entitled to be told about.
  return { slug: seed.slug, action: attached ? "attached" : action, version: versionNumber, basketVersionId };
  });
}

export async function publishAll(options: { allowUnsourced?: boolean } = {}) {
  const results: PublishResult[] = [];

  // Checked across the whole run as well as against the database, so two new theses that
  // duplicate each other are caught on the way in — not only a new one against what exists.
  const seen = await publishedBaskets();

  for (const seed of ALL_SEEDS) {
    const result = await publishSeed(seed, evidenceFor(seed.slug), {
      allowUnsourced: options.allowUnsourced,
      against: seen,
      // Needed only when the allocation is new. On a database that already holds these theses the
      // seed matches an existing basket and attaches instead, and this is ignored.
      basket: BASKET_NAMES[seed.slug],
    });
    seen.push({ slug: seed.slug, constituents: seed.constituents });
    results.push(result);
  }

  return results;
}
