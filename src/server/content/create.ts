import { eq } from "drizzle-orm";

import { slugify, type ThesisDraftInput } from "@/lib/thesis-draft";

import { env } from "../env";
import { db } from "../db/client";
import { asset, thesis } from "../db/schema";

import { expandDraft } from "./expand";
import { ContentError, publishSeed, type Attribution } from "./publish";
import type { ThesisSeed } from "./theses";

/**
 * A thesis written by somebody who is not us.
 *
 * It goes through `publishSeed`, the same function the editorial catalogue goes through, with
 * the same validators. There is deliberately no second write path: a shortcut for user
 * submissions would be a second set of rules, and the reason anything on this site is worth
 * reading is that it all cleared the same ones.
 *
 * Two things differ from an editorial thesis, and a reader is told about both:
 *
 *   1. **It carries a creator wallet.** That wallet is the only thing that can launch the
 *      thesis's token or claim its fees, and it comes from the session, never from the body.
 *   2. **It cites no sources.** The catalogue's two-source floor is checked by a person
 *      against live URLs (`scripts/verify-source-posts.ts`), and nobody has checked these.
 *      Rather than collect links nobody verifies and present them as citations, the short
 *      form collects none and the disclosure says so. An unverified link is worse than no
 *      link — it looks like a citation.
 *
 * It publishes immediately. That is a real decision with a real cost: an author earns a share
 * of trading fees on their token whether the argument was right or wrong, which is a standing
 * incentive to publish theses *for* the token. What stands against that is the form itself —
 * it will not accept a thesis with no case against it — and the disclosure on every one.
 */

/** Returns a slug nothing else is using, by appending a number when it has to. */
async function freeSlug(claim: string): Promise<string> {
  const base = slugify(claim);
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const [taken] = await db.select({ id: thesis.id }).from(thesis).where(eq(thesis.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new ContentError("Too many theses already start with that claim. Try wording it differently.");
}

export async function createThesis(params: {
  wallet: string;
  draft: ThesisDraftInput;
  /** What to call the basket if these holdings are new. Defaults to the claim. */
  basketName?: string;
}): Promise<{ slug: string; claim: string }> {
  const { draft } = params;

  // Every symbol must be a real, enabled, mainnet asset before the model is called. A
  // submission naming something we cannot buy is a submission nobody could ever act on, and
  // there is no reason to spend a model call finding that out.
  for (const holding of draft.holdings) {
    const [row] = await db
      .select({ enabled: asset.enabled })
      .from(asset)
      .where(eq(asset.symbol, holding.symbol))
      .limit(1);
    if (!row) throw new ContentError(`${holding.symbol} is not an asset this app can buy.`);
    if (!row.enabled) throw new ContentError(`${holding.symbol} is not currently enabled for trading.`);
  }

  const expanded = await expandDraft(
    {
      claim: draft.claim,
      category: draft.category,
      why: draft.why,
      against: draft.against,
      holdings: draft.holdings,
    },
    env.openRouterKey(),
  );

  const slug = await freeSlug(draft.claim);
  const name = `${params.wallet.slice(0, 4)}…${params.wallet.slice(-4)}`;

  const attribution: Attribution = {
    name,
    handle: null,
    // The inverse of the editorial disclosure, and the single most important string in this
    // feature. An author earning on volume has an interest a reader is entitled to know about
    // before they read a word of the argument.
    disclosure:
      "Written by a Thesis user, not by the Thesis team, and published without editorial review. " +
      "No sources were cited. If this thesis has a token, its author earns a share of the fees on " +
      "every trade of it — they profit from trading volume whether or not the thesis turns out to " +
      "be right.",
    creatorWallet: params.wallet,
  };

  const seed: ThesisSeed = {
    slug,
    title: draft.claim,
    claim: draft.claim,
    category: draft.category,
    summary: expanded.summary,
    // The author's own words, passed through. The model expanded them; it did not replace them.
    rationale: draft.why,
    counterargument: draft.against,
    changeMyMind: expanded.changeMyMind,
    horizonLabel: "12 months",
    reviewDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    weightRationale: expanded.weightRationale,
    constituents: draft.holdings.map((h, i) => {
      const detail = expanded.holdings.find((e) => e.symbol === h.symbol)!;
      return {
        symbol: h.symbol,
        position: i,
        weightBps: h.weightPercent * 100,
        role: detail.role,
        why: detail.why,
        limitation: detail.limitation,
      };
    }),
  };

  // No sources, deliberately — see the note at the top. The flag exists because the catalogue
  // demands two verified links and this path has none to offer honestly.
  // A new set of holdings becomes a new basket, which needs a name and a line; an allocation that
  // matches an existing basket attaches to it and ignores both. Without this, only allocations
  // somebody had already published could be published at all.
  await publishSeed(seed, [], {
    attribution,
    status: "published",
    allowUnsourced: true,
    basket: { name: basketNameFrom(params.basketName ?? draft.claim), description: basketLineFrom(expanded.summary, draft.claim) },
  });

  return { slug, claim: draft.claim };
}

/** What this wallet has written. */
export async function listMyTheses(wallet: string) {
  return db
    .select({ slug: thesis.slug, title: thesis.title, status: thesis.status, createdAt: thesis.createdAt })
    .from(thesis)
    .where(eq(thesis.creatorWallet, wallet));
}

/** A basket name the catalogue accepts: two to four words, at most 40 characters (constraints.sql). */
export function basketNameFrom(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}&'’ -]/gu, " ").split(/\s+/).filter(Boolean);
  let name = "";
  for (const w of words.slice(0, 4)) {
    const next = name ? `${name} ${w}` : w;
    if (next.length > 40) break;
    name = next;
  }
  if (!name) return "Hand Built Pack";
  return name.includes(" ") ? name : `${name} Pack`.slice(0, 40);
}

/** A one-line basket description, 20 to 200 characters: the summary's first sentence, cut at a word. */
export function basketLineFrom(summary: string, fallback: string): string {
  const flat = summary.replace(/\s+/g, " ").trim();
  const first = flat.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? flat;
  let line = first.length <= 200 ? first : `${first.slice(0, 199).replace(/\s+\S*$/, "")}…`;
  if (line.length < 20) line = fallback.replace(/\s+/g, " ").trim().slice(0, 200);
  return line.length >= 20 ? line : `${line} — a hand-built basket.`.slice(0, 200);
}
