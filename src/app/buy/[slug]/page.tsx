import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { BuyFlow } from "@/components/buy/BuyFlow";
import { getPublishedThesis } from "@/server/content/detail";
import { parseWeightQuery } from "@/lib/buy-input";
import { getCalls } from "@/server/calls/service";
import { callForThesis, plainStatement } from "@/lib/calls";
import { getGiftByInvite } from "@/server/gifts/repository";
import { GiftHeader } from "@/components/gifts/GiftShell";
import "../../landing.css";
import "../../gifts.css";
import "./buy.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getPublishedThesis((await params).slug);
  return { title: t ? `Buy · ${t.claim}` : "Thesis", robots: { index: false } };
}

export default async function BuyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ weights?: string; version?: string; gift?: string }> }) {
  const slug = (await params).slug;
  const t = await getPublishedThesis(slug);
  if (!t) notFound();
  const query = await searchParams;
  const changedVersion = Boolean(query.version && query.version !== t.versionId);
  const initialWeights = changedVersion ? null : parseWeightQuery(query.weights, t.holdings.map(h => h.symbol));
  /*
   * Opening a gift. Everything comes from the server's gift record — the amount is never read from
   * the URL — and only a reservation (claim_reserved, or delivering on a return visit) counts. The
   * record's allocation version must still be this thesis's; otherwise this is not the gift's pack.
   */
  const giftRow = query.gift ? await getGiftByInvite(query.gift) : null;
  const gift =
    giftRow && ["claim_reserved", "delivering"].includes(giftRow.state)
      ? { token: query.gift!, amountUsd: giftRow.amountUsd }
      : undefined;
  const calls = await getCalls();
  const call = callForThesis(calls, t);

  /*
   * Opening a gift happens inside the gift's own look, not the terminal's: the same paper, the gift
   * header, and nothing a recipient has no use for (the back link, site navigation, the timed call).
   */
  if (gift) {
    return (
      <div className="gift-site gift-checkout">
        <GiftHeader recipient />
        <main className="gift-checkout-main" id="main">
          <BuyFlow
            key={t.versionId}
            slug={slug}
            versionId={t.versionId}
            gift={gift}
            claim={t.claim}
            authorName={t.authorName}
            holdings={t.holdings.map((h) => ({ symbol: h.symbol, company: h.company, role: h.role, weightBps: h.weightBps }))}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="landing">
      <a className="ln-skip" href="#main">Skip to content</a>
      <SiteHeader />
      <main className="ln-container by-main" id="main">
        <Link href={`/t/${slug}`} className="by-back">
          <ArrowLeft size={14} aria-hidden="true" /> Back to the thesis
        </Link>
        <BuyFlow
          key={t.versionId}
          slug={slug}
          versionId={t.versionId}
          initialWeights={gift ? undefined : initialWeights ?? undefined}
          gift={gift}
          callStatement={call ? plainStatement(call.statement) : undefined}
          initialNotice={changedVersion ? "This thesis has a new version. Review the current holdings and weights below." : query.weights && !initialWeights ? "That allocation link was invalid. The author’s weights are shown below." : undefined}
          claim={t.claim} authorName={t.authorName}
          holdings={t.holdings.map((h) => ({
            symbol: h.symbol,
            company: h.company,
            role: h.role,
            weightBps: h.weightBps,
          }))}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
