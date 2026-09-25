import { eq } from "drizzle-orm";
import { cache } from "react";
import type { GiftPack } from "@/lib/gifts";
import { listBaskets, type AttachedArgument, type BasketView } from "@/server/baskets/queries";
import { EQUITY_ASSETS, PRESTOCKS_ASSETS } from "@/server/assets/allowlist";
import { db } from "@/server/db/client";
import { giftPackDesign } from "@/server/db/schema";
import packHistory from "@/data/pack-history.json";
import { packAttention } from "./attention";

const designs = [
  // Built for the PreStocks bounty (25 Sep): OpenAI and Anthropic through PreStocks' tokens, with
  // NVIDIA as the one public reference price. Pre-IPO: flagged on every screen that shows it.
  { slug: "the-ai-money-is-private-now", name: "Before they go public", subtitle: "A piece of OpenAI and Anthropic, before the IPO.", forWhom: "For the friend who's always early.", color: "red", motif: "spark", edition: "06" },
  // Research subject 1, "Intelligence becomes a utility" (docs/curated-thesis-research.md): the chip
  // and the two clouds that rent it out. Chosen on research fit, not return.
  { slug: "contracted-capex-pays-the-supplier-first", name: "The AI optimist", subtitle: "The chips and clouds every AI app rents.", forWhom: "For the friend already living in the future.", color: "blue", motif: "orbit", edition: "01" },
  // Not featured (24 Sep): same subject as the pack above (65% shared weight), and Palantir is an
  // application, outside that subject's compute-and-cloud scope. Kept so gifts already sent still open.
  { slug: "ai-spending-keeps-growing", name: "The AI optimist", subtitle: "A little stake in a big idea.", forWhom: "For the friend already living in the future.", color: "blue", motif: "orbit", edition: "01", featured: false },
  // Not featured (23 Sep): kept so gifts already sent as this pack still open.
  { slug: "financial-activity-moves-onchain", name: "A new money era", subtitle: "For a world that moves differently.", forWhom: "For the one who sees money differently.", color: "green", motif: "bloom", edition: "02", featured: false },
  { slug: "digital-advertising-takes-a-bigger-share", name: "Made for the internet", subtitle: "The businesses behind the scroll.", forWhom: "For your very online favorite person.", color: "red", motif: "spark", edition: "03" },
  // Research subject 5, "Medicine rewrites appetite". About a treatment market, never about the
  // recipient's body: the name and lines say medicine, not weight.
  { slug: "appetite-medicine-becomes-everyday-care", name: "The new medicine", subtitle: "The two companies behind the appetite drugs.", forWhom: "For the friend who follows the science.", color: "green", motif: "bloom", edition: "05" },
  { slug: "breadth-beats-picking-the-buildout", name: "The long game", subtitle: "Own a little of everything.", forWhom: "For the one who’s just getting started.", color: "gold", motif: "rings", edition: "04" },
] as const;

/** Custom packs are addressed by the thesis their builder published, never by a basket slug. */
export const CUSTOM_PREFIX = "my-";

/**
 * Whether a basket can be given at all: buyable now, three holdings, every one on the allowlist,
 * weights that add up. The same rule for curated and custom packs — a pack is presentation, and it
 * never loosens what can be bought.
 */
function qualifies(b: BasketView, allowed: Set<string>): boolean {
  if (!b.execution.buyable || !b.execution.holdings.every((h) => allowed.has(h.mint))) return false;
  return b.execution.holdings.reduce((sum, h) => sum + h.weightBps, 0) === 10000;
}

/** Giftable: enabled xStocks, and the enabled PreStocks tokens (pre-IPO, flagged as such below). */
function allowedMints(): Set<string> {
  return new Set([...EQUITY_ASSETS, ...PRESTOCKS_ASSETS].filter((a) => a.enabled).map((a) => a.mint));
}

const PRE_IPO = new Set(PRESTOCKS_ASSETS.map((a) => a.mint));
/** A pack holding any private-company token says so wherever it is shown: there is no public share price behind it. */
function isPreIpo(b: BasketView): boolean {
  return b.execution.holdings.some((h) => PRE_IPO.has(h.mint));
}

/** The call's record, latest first reading last. Starts at 0 so the chart has its origin. */
function performanceOf(b: BasketView): GiftPack["performance"] {
  const p = b.performance;
  const last = p?.points.at(-1);
  if (!p || !last) return null;
  return {
    startsAt: p.startsAt,
    benchmark: p.benchmark,
    basketPct: last.basketPct,
    benchmarkPct: last.benchmarkPct,
    points: [{ basketPct: 0, benchmarkPct: 0 }, ...p.points.map((x) => ({ basketPct: x.basketPct, benchmarkPct: x.benchmarkPct }))],
  };
}

/** The 12-month what-if for a thesis, if the snapshot has one. */
function historyOf(thesisSlug: string): GiftPack["history"] {
  const h = (packHistory.packs as Record<string, { returnPct: number; benchmarkPct: number; points: { basketPct: number; benchmarkPct: number }[] }>)[thesisSlug];
  return h ? { ...h, from: packHistory.from, asOf: packHistory.asOf } : null;
}

function holdingsOf(b: BasketView): GiftPack["holdings"] {
  return b.execution.holdings.map((h) => ({ symbol: h.symbol, company: h.company, weightBps: h.weightBps, why: h.why }));
}

/** Presentation wraps a real published allocation. No fixture basket or fabricated holdings. */
export const giftCatalogue = cache(async (): Promise<{ packs: GiftPack[]; unavailable: boolean }> => {
  const { packs, unavailable } = await allCuratedPacks();
  const hidden = new Set<string>(designs.filter((d) => "featured" in d && d.featured === false).map((d) => d.slug));
  return { packs: packs.filter((p) => !hidden.has(p.thesisSlug)), unavailable };
});

/** Every curated pack, featured or not: what a gift already sent may name. */
const allCuratedPacks = cache(async (): Promise<{ packs: GiftPack[]; unavailable: boolean }> => {
  try {
    const baskets = await listBaskets();
    const allowed = allowedMints();
    const packs: GiftPack[] = [];
    for (const design of designs) {
      const b = baskets.find((item) => item.execution.executionSlug === design.slug);
      if (!b || !qualifies(b, allowed)) continue;
      const origin = b.arguments.find((a) => a.role === "origin");
      if (!origin) continue;
      packs.push({
        id: b.slug, versionId: b.execution.basketVersionId,
        name: design.name, subtitle: design.subtitle, forWhom: design.forWhom,
        color: design.color, motif: design.motif, edition: design.edition,
        basketName: b.name, thesisSlug: design.slug, buySlug: design.slug, claim: origin.claim,
        counterargument: origin.counterargument,
        holdings: holdingsOf(b),
        performance: performanceOf(b),
        history: historyOf(design.slug),
        preIpo: isPreIpo(b),
      });
    }
    // Attention is decoration: fetched in parallel, cached for a day, and a failure just leaves it off.
    const attention = await Promise.all(packs.map((p) => packAttention(p.holdings.map((h) => h.symbol)).catch(() => null)));
    packs.forEach((p, i) => (p.attention = attention[i]));
    return { packs, unavailable: false };
  } catch {
    // Do not expose database errors or pretend a fixture is a reviewed gift.
    console.error("Gift catalogue unavailable");
    return { packs: [], unavailable: true };
  }
});

/**
 * A pack by id: curated first, then one somebody built.
 *
 * A custom pack is the builder's own published thesis. Publishing may attach that thesis to an
 * existing basket with the same holdings (see content/publish.ts), so the pack takes its holdings
 * from whichever basket carries the thesis, its words from the thesis itself, and buys through the
 * basket's executing thesis. It qualifies by exactly the curated rule, checked again every time.
 */
export const resolveGiftPack = cache(async (id: string): Promise<GiftPack | null> => {
  const { packs } = await allCuratedPacks();
  const curated = packs.find((p) => p.id === id);
  if (curated) return curated;
  if (!id.startsWith(CUSTOM_PREFIX)) return null;

  const thesisSlug = id.slice(CUSTOM_PREFIX.length);
  const [design] = await db.select().from(giftPackDesign).where(eq(giftPackDesign.thesisSlug, thesisSlug)).limit(1);
  if (!design) return null;

  const baskets = await listBaskets();
  let found: { b: BasketView; arg: AttachedArgument } | null = null;
  for (const b of baskets) {
    const arg = b.arguments.find((a) => a.slug === thesisSlug);
    if (arg) {
      found = { b, arg };
      break;
    }
  }
  if (!found || !qualifies(found.b, allowedMints())) return null;
  const { b, arg } = found;
  return {
    id, versionId: b.execution.basketVersionId,
    name: design.name,
    subtitle: design.name === arg.claim ? "A pack made by hand." : arg.claim,
    forWhom: "Built for one person.",
    color: design.color as GiftPack["color"], motif: "rings", edition: "1/1",
    basketName: b.name, thesisSlug, buySlug: b.execution.executionSlug, claim: arg.claim,
    counterargument: arg.counterargument,
    holdings: holdingsOf(b),
    performance: performanceOf(b),
    preIpo: isPreIpo(b),
  };
});
