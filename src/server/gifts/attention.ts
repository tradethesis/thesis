/**
 * How much attention a pack's companies are getting: English Wikipedia page views for each
 * holding's article, this week against the week before, summed across the pack.
 *
 * Chosen because it is real, free, public and refreshed daily, and it does not depend on how many
 * people use Thesis (on beta, a handful). It measures interest in the companies, not in the pack or
 * the idea, and the card says exactly that. Views are human traffic only (`agent=user`).
 *
 * Nothing here is invented: a holding without a mapped article, or a failed fetch, drops out, and
 * a pack with no usable article returns null rather than a zero.
 */

/** Wikipedia article per token, by the holding's symbol. Checked against the live API, 24 Sep 2026. */
const ARTICLE: Record<string, string> = {
  NVDAx: "Nvidia",
  MSFTx: "Microsoft",
  AMZNx: "Amazon_(company)",
  GOOGLx: "Alphabet_Inc.",
  METAx: "Meta_Platforms",
  PLTRx: "Palantir_Technologies",
  COINx: "Coinbase",
  CRCLx: "Circle_Internet_Group",
  HOODx: "Robinhood_Markets",
  MSTRx: "Strategy_Inc.",
  GMEx: "GameStop",
  MCDx: "McDonald's",
  LLYx: "Eli_Lilly_and_Company",
  NVOx: "Novo_Nordisk",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  KALSHI: "Kalshi",
  POLYMARKET: "Polymarket",
  QQQx: "Nasdaq-100",
  SPYx: "S&P_500",
  GLDx: "Gold",
};

export type Attention = {
  /** Page views over the last 7 complete days. */
  weekViews: number;
  /** Change against the 7 days before, in percent. */
  changePct: number;
  /** Last day counted, YYYY-MM-DD (UTC). */
  asOf: string;
};

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

async function views(article: string, now: number): Promise<number[] | null> {
  const end = new Date(now - DAY);
  // Two spare days: some articles' latest day lands late, and a short series used to drop the
  // company entirely. The last 14 days that exist are compared.
  const start = new Date(now - 16 * DAY);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${ymd(start)}/${ymd(end)}`;
  try {
    const res = await fetch(url, {
      // Wikimedia asks every client to identify itself with a way to reach the operator.
      headers: { "user-agent": "ThesisGifts/1.0 (https://tradethesis.xyz)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: { views: number }[] };
    const items = body.items ?? [];
    return items.length >= 14 ? items.slice(-14).map((i) => i.views) : null;
  } catch {
    return null;
  }
}

/** Pure: sum each holding's series and compare the two weeks. Exported for tests. */
export function attentionFrom(series: number[][], asOf: string): Attention | null {
  if (!series.length) return null;
  const prior = series.reduce((s, v) => s + v.slice(0, 7).reduce((a, b) => a + b, 0), 0);
  const week = series.reduce((s, v) => s + v.slice(7).reduce((a, b) => a + b, 0), 0);
  if (prior <= 0) return null;
  return { weekViews: week, changePct: ((week - prior) / prior) * 100, asOf };
}

export async function packAttention(symbols: string[], now = Date.now()): Promise<Attention | null> {
  const articles = symbols.map((s) => ARTICLE[s]).filter((a): a is string => Boolean(a));
  const series = (await Promise.all(articles.map((a) => views(a, now)))).filter((v): v is number[] => v !== null);
  return attentionFrom(series, new Date(now - DAY).toISOString().slice(0, 10));
}
