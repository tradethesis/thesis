import { ArrowUpRight, FileText, SquareArrowOutUpRight } from "lucide-react";

import { plainStatement, type CallRecord } from "@/lib/calls";
import { drawerLinkProps } from "@/lib/open-thesis";
import type { ThesisCard } from "@/server/content/queries";

import { BuyModal } from "../buy/BuyModal";
import { AuthorMark } from "../calls/AuthorMark";
import { BrandMark } from "../landing/BrandMark";
import { FollowThesis } from "../calls/FollowThesis";
import { ShareThesis } from "../calls/ShareThesis";
import { TokenLogo } from "../calls/TokenLogo";

import { BasketFigures } from "./BasketFigures";
import { CardMenu } from "./CardMenu";
import { PostedAt } from "./PostedAt";
import { TakeASide, YourCall } from "./TakeASide";
import { WhySheet } from "./WhySheet";

/**
 * One belief, collapsed: a post, a basket, and a row of actions.
 *
 * Three things, in that order, and nothing else. What this replaced had seven blocks — a
 * quote, a heading, a byline, a basket strip, a performance line, a conviction control, a
 * button row and a social row — each defensible on its own and unreadable stacked fifty
 * times. The rule now is that a collapsed card is the conversation plus what it buys.
 *
 * The source post leads, because it is the thing that is actually true about the world:
 * somebody said this, in public, and it can be checked. Where there is no post the
 * editorial headline takes the lead position instead, and says whose headline it is.
 *
 * Everything else — the argument, the objection, each holding's job and its risk, the full
 * engagement figures — is behind the tile, the menu, or the thesis URL.
 *
 * Three identities stay distinct and none is allowed to blur into another:
 *   - the person who posted the idea, at the top, quoted and linked;
 *   - the desk that built the basket, named in the tile's label and on the thesis page;
 *   - the money, which belongs to whoever buys and is never implied here.
 *
 * The collapsed card does not print the non-endorsement. It is one tap away and unmissable
 * where it lands: SourcePost on /t/<slug> states it twice, and the tile's own accessible
 * name carries it. On a card this small the line cost a row and read as boilerplate.
 */
export function FeedCard({
  thesis,
  call,
  counts,
  activity,
}: {
  thesis: ThesisCard;
  call: CallRecord | null;
  counts?: { backing: number; doubting: number };
  activity?: { volumeUsdc: number; buyers: number };
}) {
  const post = thesis.sourcePost;
  const tickers = thesis.holdings.map((h) => h.symbol).join(" · ");

  return (
    <article className="fc">
      {/*
        Who, then what future. Nothing else.

        The card used to carry the whole post and a paragraph of summary, which made a feed
        of them a stack of short articles. But a thesis is not an article — it is a signal:
        somebody is pointing at a future, and the basket is that future expressed in things
        you can actually own. Reading the argument is a second act, and it has a drawer.

        So the text here is one name, one claim and three tickers. Everything that was cut
        is one tap away and none of it is gone.
      */}
      <div className="fc-who">
        {post ? (
          <AuthorMark handle={post.handle} author={post.author} />
        ) : (
          <span className="fc-mark">
            <BrandMark />
          </span>
        )}
        <p>
          <strong>{post ? post.author : "Thesis editorial"}</strong>
          {post ? (
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              {post.handle}
              <ArrowUpRight size={11} aria-hidden="true" />
              <span className="ln-sr-only"> — open the post on X in a new tab</span>
            </a>
          ) : (
            <span className="fc-cat">{thesis.category}</span>
          )}
          <span className="fc-when">
            {post ? <PostedAt at={post.postedAt} /> : thesis.horizonLabel}
          </span>
        </p>
      </div>

      {/*
        Who is signalling, when that is not the person above.
        The name at the top raised the question; it did not choose these assets. Saying so
        as a credit is what lets the basket sit directly under somebody else's face.
      */}
      {post && (
        <p className="fc-by">
          <BrandMark />
          {thesis.authorName} signals
        </p>
      )}

      {/*
        The future being signalled, at full width.
        It sat inside the tile for a while, sharing a line with the logo stack and two
        figures, and came out as "Spending a trillion is the ea…". This is the one sentence
        the card exists to carry; it does not get truncated to make room for a ticker list
        that is repeated directly underneath it.
      */}
      <h2 className="fc-claim">
        <a {...drawerLinkProps(thesis.slug)}>{thesis.claim}</a>
      </h2>

      {/* How that future is held, and the way into it. Tapping opens the buy modal. */}
      <BuyModal
        className="fc-tile"
        slug={thesis.slug}
        claim={thesis.claim}
        versionId={thesis.versionId}
        callStatement={call ? plainStatement(call.statement) : undefined}
        authorName={thesis.authorName}
        holdings={thesis.holdings}
      >
        <span className="fc-tile-logos" aria-hidden="true">
          {thesis.holdings.map((h, i) => (
            <span key={h.symbol} style={{ zIndex: thesis.holdings.length - i }}>
              <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
            </span>
          ))}
        </span>

        <span className="fc-tile-name">
          <strong>{tickers}</strong>
          <span className="ln-sr-only">
            . Weights: {thesis.holdings.map((h) => `${h.company} ${h.weightBps / 100}%`).join(", ")}. Basket by{" "}
            {thesis.authorName}
            {post ? `, not ${post.author}'s selection.` : "."}
          </span>
        </span>

        <BasketFigures call={call} />
      </BuyModal>

      {/*
        What people actually did, as opposed to what they said.
        Only live purchases count. Every intent in development is a simulation, and a
        "$600 invested" built from money nobody spent is the worst number this product
        could print — so the line is absent until it is true rather than showing a zero.
      */}
      {activity && activity.buyers > 0 && (
        <p className="fc-bought">
          <strong>{activity.buyers}</strong> {activity.buyers === 1 ? "person" : "people"} bought this ·{" "}
          <strong>${Math.round(activity.volumeUsdc).toLocaleString("en-US")}</strong>
        </p>
      )}

      <div className="fc-foot">
        {post?.metrics ? <SourceReach metrics={post.metrics} /> : <span className="fc-reach" />}

        <div className="fc-foot-acts">
          <TakeASide thesisId={thesis.thesisId} claim={thesis.claim} counts={counts} variant="compact" />
          <CardMenu label={thesis.claim}>
            <WhySheet
              thesis={thesis}
              className="fc-menu-item"
              label={
                <>
                  <FileText size={14} aria-hidden="true" />
                  Why this basket
                </>
              }
            />
            <a {...drawerLinkProps(thesis.slug)} className="fc-menu-item">
              <SquareArrowOutUpRight size={14} aria-hidden="true" />
              Open the thesis
            </a>
            <ShareThesis slug={thesis.slug} title={thesis.claim} className="fc-menu-item" />
            <FollowThesis slug={thesis.slug} title={thesis.claim} className="fc-menu-item" />
          </CardMenu>
        </div>
      </div>

      {/* Only on a card you have called, and only once there is something to report. */}
      <YourCall thesisId={thesis.thesisId} />
    </article>
  );
}

/**
 * How the quoted post did, on X.
 *
 * Three figures and the word "on X". The label is not decoration: this is engagement with
 * somebody else's post on somebody else's platform, and without saying so it reads as our
 * own traction. The date it was captured is in the title, because these are a snapshot and
 * not a live counter.
 */
function SourceReach({ metrics }: { metrics: NonNullable<NonNullable<ThesisCard["sourcePost"]>["metrics"]> }) {
  const n = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}m` : v >= 10_000 ? `${Math.floor(v / 1000)}k` : v.toLocaleString("en-US");
  const on = new Date(metrics.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <p className="fc-reach" title={`On X, captured ${on}`}>
      <span>♡ {n(metrics.likes)}</span>
      <span>⟳ {n(metrics.reposts)}</span>
      <span>{n(metrics.views)} views</span>
      <em>on X</em>
    </p>
  );
}
