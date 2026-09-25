"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

import { callTiming, plainStatement, scoreCall, signedPercent, type CallRecord } from "@/lib/calls";
import { OPEN_THESIS } from "@/lib/open-thesis";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

import { BuyModal } from "../buy/BuyModal";
import { AuthorMark } from "../calls/AuthorMark";
import { TokenLogo } from "../calls/TokenLogo";
import { TakeASide } from "../feed/TakeASide";

type Holding = {
  mint: string;
  symbol: string;
  company: string;
  issuer: string;
  issuerPowers: string;
  termsUrl: string;
  role: string;
  why: string;
  limitation: string;
  weightBps: number;
};

type Activity = { volumeUsdc: number; buyers: number };

type Detail = {
  thesisId: string;
  slug: string;
  category: string;
  authorName: string;
  authorDisclosure: string;
  versionId: string;
  versionNumber: number;
  claim: string;
  summary: string;
  rationale: string;
  counterargument: string;
  changeMyMind: string;
  horizonLabel: string;
  holdings: Holding[];
  evidence: { url: string; title: string; source: string; relevance: string }[];
  sourcePost: { url: string; author: string; handle: string; text: string } | null;
};

/**
 * A thesis, opened beside the feed instead of instead of it.
 *
 * Reading a belief and deciding on it are the same act, and sending somebody to another URL
 * to do the second half meant losing their place in the first. The drawer slides in from
 * the edge, keeps the feed behind it, and closes back to exactly where they were.
 *
 * /t/<slug> is still the real page and every trigger is still a real link to it, so a
 * shared URL, a middle click and a visit with JavaScript disabled all land somewhere that
 * works. The drawer is an enhancement over a working link, never a replacement for one.
 *
 * Mounted once, at the top. The things that open it are spread across the layout and both
 * rails, and fifty-nine of them holding fifty-nine copies of this would be fifty-nine
 * dialogs in the DOM.
 */
export function ThesisDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);

  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onClose = () => {
      setSlug(null);
      setDetail(null);
      setCall(null);
      setActivity(null);
      setFailed(false);
      if (locked.current) {
        locked.current = false;
        unlockScroll();
      }
    };
    el.addEventListener("close", onClose);
    return () => {
      el.removeEventListener("close", onClose);
      if (locked.current) {
        locked.current = false;
        unlockScroll();
      }
    };
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (typeof next !== "string") return;
      setSlug(next);
      setDetail(null);
      setCall(null);
      setActivity(null);
      setFailed(false);
      if (!ref.current?.open) {
        locked.current = true;
        lockScroll();
        ref.current?.showModal();
      }
    };
    window.addEventListener(OPEN_THESIS, onOpen);
    return () => window.removeEventListener(OPEN_THESIS, onOpen);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let live = true;

    fetch(`/api/thesis/${slug}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { thesis: Detail; call: CallRecord | null; activity: Activity | null }) => {
        if (!live) return;
        setDetail(body.thesis);
        setCall(body.call);
        setActivity(body.activity);
      })
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={detail ? `Thesis: ${detail.claim}` : "Thesis"}
      onClick={(e) => {
        // Clicking the backdrop closes. The panel stops the event, so a click inside it
        // never reaches here.
        if (e.target === ref.current) close();
      }}
    >
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <p className="drawer-eyebrow">{detail ? detail.category : "Loading"}</p>
          <button type="button" className="sheet-close" onClick={close}>
            <X size={18} aria-hidden="true" />
            <span className="ln-sr-only">Close</span>
          </button>
        </div>

        {failed ? (
          <p className="drawer-quiet" role="alert">
            That thesis could not be loaded.{" "}
            {slug && <Link href={`/t/${slug}`}>Open the page instead</Link>}
          </p>
        ) : !detail ? (
          <p className="drawer-quiet" role="status">
            Loading…
          </p>
        ) : (
          <Body detail={detail} call={call} activity={activity} onNavigate={close} />
        )}
      </div>
    </dialog>
  );
}

function Body({
  detail,
  call,
  activity,
  onNavigate,
}: {
  detail: Detail;
  call: CallRecord | null;
  activity: Activity | null;
  onNavigate: () => void;
}) {
  const post = detail.sourcePost;

  return (
    <div className="drawer-body">
      <h2>{detail.claim}</h2>
      <p className="drawer-summary">{detail.summary}</p>

      {post && (
        <div className="drawer-post">
          <AuthorMark handle={post.handle} author={post.author} />
          <div>
            <p className="drawer-post-who">
              <strong>{post.author}</strong>
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                {post.handle}
                <ArrowUpRight size={11} aria-hidden="true" />
              </a>
            </p>
            <blockquote>{post.text}</blockquote>
          </div>
        </div>
      )}

      <section>
        <h3>The basket</h3>
        <ul className="drawer-holdings">
          {detail.holdings.map((h, i) => (
            <li key={h.mint}>
              <div className="drawer-holding-head">
                <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
                <strong>{h.symbol}</strong>
                <span className="drawer-role">{h.role}</span>
                <span className="drawer-weight ln-num">{h.weightBps / 100}%</span>
              </div>
              <p>{h.why}</p>
              {/* The limitation is never collapsed away. A holding's weakness is the part
                  a reader skips, so it sits in the same block as the reason to own it. */}
              <p className="drawer-limit">{h.limitation}</p>
              {h.issuerPowers && (
                <p className="drawer-issuer">
                  {h.issuer}: {h.issuerPowers}
                  {h.termsUrl && (
                    <>
                      {" "}
                      <a href={h.termsUrl} target="_blank" rel="noopener noreferrer">
                        Terms <ArrowUpRight size={10} aria-hidden="true" />
                      </a>
                    </>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>The argument</h3>
        <p>{detail.rationale}</p>
      </section>

      <section>
        <h3>The case against</h3>
        <p>{detail.counterargument}</p>
      </section>

      <section>
        <h3>What would change our mind</h3>
        <p>{detail.changeMyMind}</p>
      </section>

      {call && <CallLine call={call} />}

      {/* Live purchases only. A count built from simulated runs would be the one number
          here that somebody could act on and be wrong about. */}
      {activity && activity.buyers > 0 && (
        <section>
          <h3>Who bought it</h3>
          <p className="drawer-call">
            <strong>{activity.buyers}</strong>
            <span>
              {activity.buyers === 1 ? "person" : "people"} · ${Math.round(activity.volumeUsdc).toLocaleString("en-US")} through this app
            </span>
          </p>
          <p className="drawer-quiet">
            What this app bought, not what those wallets hold now. Tokens can be sold or moved without this record
            changing.
          </p>
        </section>
      )}

      {detail.evidence.length > 0 && (
        <section>
          <h3>Sources</h3>
          <ul className="drawer-sources">
            {detail.evidence.map((e) => (
              <li key={e.url}>
                <a href={e.url} target="_blank" rel="noopener noreferrer">
                  {e.title} <ArrowUpRight size={11} aria-hidden="true" />
                </a>
                <span>{e.source}</span>
                <p>{e.relevance}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="drawer-disclosure">{detail.authorDisclosure}</p>

      <div className="drawer-actions">
        <BuyModal
          slug={detail.slug}
          claim={detail.claim}
          versionId={detail.versionId}
          callStatement={call ? plainStatement(call.statement) : undefined}
          authorName={detail.authorName}
          holdings={detail.holdings}
        />
        <Link href={`/t/${detail.slug}`} className="ln-btn ln-btn--secondary" onClick={onNavigate}>
          Full page
        </Link>
      </div>

      <TakeASide thesisId={detail.thesisId} claim={detail.claim} />
    </div>
  );
}

/** How the model basket has done, with the same caveat the card carries. */
function CallLine({ call }: { call: CallRecord }) {
  const started = call.start.observedAt !== call.latest.observedAt;
  if (!started) {
    return (
      <section>
        <h3>The call</h3>
        <p className="drawer-quiet">Starting prices set. {callTiming(call).label}.</p>
      </section>
    );
  }

  const score = scoreCall(call.start, call.latest);
  return (
    <section>
      <h3>The call</h3>
      <p className="drawer-call">
        <strong className={score.basketPercent > 0 ? "is-up" : score.basketPercent < 0 ? "is-down" : ""}>
          {signedPercent(score.basketPercent)}
        </strong>
        <span>
          model basket · {call.benchmark} {signedPercent(score.benchmarkPercent)} · {callTiming(call).label}
        </span>
      </p>
      <p className="drawer-quiet">{plainStatement(call.statement)}</p>
    </section>
  );
}
