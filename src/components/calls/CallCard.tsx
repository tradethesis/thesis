import Link from "next/link";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import type { CallRecord } from "@/lib/calls";
import type { ThesisCard } from "@/server/content/queries";
import { BuyModal } from "../buy/BuyModal";
import { CallScore } from "./CallScore";
import { SourcePost } from "./SourcePost";
import { TokenLogo } from "./TokenLogo";
import { FollowThesis } from "./FollowThesis";
import { ShareThesis } from "./ShareThesis";

export function CallCard({ thesis, call, followingView = false }: { thesis: ThesisCard; call: CallRecord | null; followingView?: boolean }) {
  const href = `/t/${thesis.slug}`;
  return <article className="cc">
    <div className="cc-overview">
      <div className="cc-idea">
        <div className="cc-meta"><span className="cc-category">{thesis.category}</span><span>Basket by {thesis.authorName}</span></div>
        {/*
          The post leads on the theses that have one. It is the reason the thesis exists,
          and someone else's sentence is what makes a reader stop — our claim is the answer
          to it, and an answer reads better after the question. The label below keeps the
          two apart, which is the whole obligation here: the quote is theirs, the read is
          ours, and nobody should have to work out which is which.
        */}
        {thesis.sourcePost && <SourcePost post={thesis.sourcePost} compact />}
        {thesis.sourcePost && <p className="cc-read-label">Thesis&rsquo;s read</p>}
        <h2 className="cc-claim"><Link href={href}>{thesis.claim}</Link></h2>
        <p className="cc-connection">{thesis.summary}</p>
        <div className="cc-social"><FollowThesis slug={thesis.slug} title={thesis.claim} /><ShareThesis slug={thesis.slug} title={thesis.claim} /></div>
      </div>
      <div className="cc-basket">
        <p className="cc-basket-label">One way to back it</p>
        <ul className="cc-holdings" aria-label="What the basket holds">
          {thesis.holdings.map((h, i) => <li key={h.symbol}><TokenLogo symbol={h.symbol} company={h.company} tone={i} /><span className="cc-asset"><strong>{h.company}</strong><small>{h.symbol} · {h.role}</small></span><span className="cc-weight">{h.weightBps / 100}%</span></li>)}
        </ul>
        <div className="cc-actions"><BuyModal slug={thesis.slug} claim={thesis.claim} versionId={thesis.versionId} callStatement={call?.statement} authorName={thesis.authorName} holdings={thesis.holdings} /></div>
        <p className="cc-basket-note">Choose an amount. Adjust if you like.</p>
      </div>
    </div>
    {followingView && <div className="cc-follow-update">
      {thesis.latestUpdate ? <><span className="ln-eyebrow">Latest evidence update · {new Date(thesis.latestUpdate.authoredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span><strong>{thesis.latestUpdate.title}</strong><p>{thesis.latestUpdate.body}</p></> : <p>Following version {thesis.versionNumber}. No editorial updates since publication. Check the call below for its latest result.</p>}
      <Link href={`${href}#history`}>View the record <ArrowUpRight size={13} aria-hidden="true" /></Link>
    </div>}
    <details className="cc-read">
      <summary><span>Read the argument <small>{thesis.supportingCount} supporting sources · {thesis.againstCount} against</small></span><ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="cc-research">
        <section><h3>The case</h3><p>{thesis.rationale}</p></section>
        <section className="cc-objection"><h3>The strongest objection</h3><p>{thesis.counterargument}</p></section>
        <section className="cc-research-holdings"><h3>Why these assets?</h3>{thesis.holdings.map(h => <div key={h.symbol}><h4>{h.company} <span>{h.symbol} · {h.role}</span></h4><p>{h.why}</p><p className="cc-limitation"><strong>The tradeoff.</strong> {h.limitation}</p></div>)}</section>
        <Link href={href} className="cc-full-link">Full thesis, sources & history <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
    </details>
    <CallScore call={call} />
  </article>;
}
