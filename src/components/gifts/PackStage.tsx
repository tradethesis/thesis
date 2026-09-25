"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { isMuted, pop, setMuted, whooshes } from "@/lib/gift-sound";
import type { GiftPack as Pack } from "@/lib/gifts";

import { GiftPack } from "./GiftPack";
import { PackRip } from "./PackRip";
import type { Phase, SceneHandle } from "./pack-scene";

/**
 * The tear, and nothing else.
 *
 * A full-screen stage over the page: the pack, one line telling you how to open it, and a sound
 * toggle. No header, no amount, no terms — everything that needed saying was said before this, and
 * everything worth seeing comes after. The contents render on the page underneath the moment the
 * pack bursts, so the stage fades away onto them rather than cutting to a new screen.
 *
 * The pack is a WebGL mesh (pack-scene.ts), loaded only when the stage opens. Without WebGL, or with
 * reduced motion, it falls back to the flat CSS tear (PackRip), which itself skips the animation
 * under reduced motion.
 */
export function PackStage({
  pack,
  from,
  cards,
  onOpened,
  onClosed,
  image,
  waiting = null,
  autoTear = false,
}: {
  pack: Pack;
  /** Who it is from, shown small at the top. */
  from?: string;
  cards: number;
  /** The pack has burst: render the contents underneath. */
  onOpened: () => void;
  /** The stage has faded out: unmount it. */
  onClosed: () => void;
  /** The sender's photo for the middle of the pack. */
  image?: string | null;
  /**
   * The gift is being bought behind the pack: show where it is instead of the tear control. A
   * failure keeps the pack up and offers the retry, so nothing on screen claims it opened.
   */
  waiting?: { label: string; failed?: boolean; onRetry?: () => void } | null;
  /** Bought and confirmed: tear it open without asking. One tap, then boom. */
  autoTear?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tearButton = useRef<HTMLButtonElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const lockedRef = useRef(false);
  const [mode, setMode] = useState<"pending" | "3d" | "flat">("pending");
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("sealed");
  const [leaving, setLeaving] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMutedState(isMuted());
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(!reduced && hasWebGL() ? "3d" : "flat");
    // The stage owns the screen while it is up.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  useEffect(() => {
    if (mode !== "3d" || !host.current) return;
    let dead = false;
    import("./pack-scene")
      .then(({ mountPackScene }) =>
        mountPackScene(host.current!, pack, {
          onReady: () => !dead && setReady(true),
          onPhase: (p) => !dead && setPhase(p),
          onOpened: () => {
            whooshes(cards);
            onOpened();
            setLeaving(true);
          },
          onDone: () => onClosed(),
        }, image),
      )
      .then((h) => {
        if (dead) h.destroy();
        else {
          scene.current = h;
          h.setLocked(lockedRef.current);
        }
      })
      .catch(() => !dead && setMode("flat"));
    return () => {
      dead = true;
      scene.current?.destroy();
      scene.current = null;
    };
    // The stage is mounted once per opening; the callbacks it was given are the ones it keeps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (ready && !waiting) tearButton.current?.focus({ preventScroll: true });
  }, [ready, waiting]);

  // While the gift is being bought the seal can't be torn by hand.
  lockedRef.current = Boolean(waiting) && !autoTear;
  useEffect(() => {
    scene.current?.setLocked(lockedRef.current);
  }, [ready, waiting, autoTear]);

  // The purchase confirmed: burst. A beat of stillness first, so the change from waiting reads.
  const autoTorn = useRef(false);
  useEffect(() => {
    if (!autoTear || autoTorn.current) return;
    if (mode === "flat") {
      autoTorn.current = true;
      onOpened();
      onClosed();
      return;
    }
    if (!ready || !scene.current) return;
    autoTorn.current = true;
    const t = setTimeout(() => scene.current?.tear(1), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTear, ready, mode]);

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) pop();
  }

  if (!mounted) return null;
  const busy = phase === "tearing" || phase === "burst" || phase === "torn";

  return createPortal(
    <div
      className={`gift-site gift-stage${leaving ? " gift-stage--leaving" : ""}${waiting && !waiting.failed && !autoTear ? " gift-stage--waiting" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Open your gift: ${pack.name}`}
      data-phase={phase}
      data-mode={mode}
    >
      <div className="gift-stage-top">
        <p className="gift-stage-from">{from ? `From ${from}` : ""}</p>
        {mode === "3d" && (
          <button type="button" className="gift-stage-sound" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>
        )}
      </div>

      {mode === "flat" ? (
        <div className="gift-stage-flat">
          {waiting && !autoTear ? (
            <div className="gift-stage-flat-wait">
              <GiftPack pack={pack} image={image} />
              <p className={`gift-stage-status${waiting.failed ? " gift-stage-status--failed" : ""}`} role="status" aria-live="polite">{waiting.label}</p>
              {waiting.failed && waiting.onRetry && <button type="button" className="gift-stage-tear" onClick={waiting.onRetry}>Try again</button>}
            </div>
          ) : (
          <PackRip
            pack={pack}
            image={image}
            cards={cards}
            onOpened={() => {
              onOpened();
              onClosed();
            }}
          />
          )}
        </div>
      ) : (
        <>
          <div className="gift-stage-scene" ref={host}>
            {!ready && (
              <div className="gift-stage-placeholder" aria-hidden="true">
                <GiftPack pack={pack} image={image} />
              </div>
            )}
          </div>
          <div className="gift-stage-bottom">
            {waiting && !autoTear ? (
              <>
                <p className={`gift-stage-status${waiting.failed ? " gift-stage-status--failed" : ""}`} role="status" aria-live="polite">{waiting.label}</p>
                {waiting.failed && waiting.onRetry && (
                  <button type="button" className="gift-stage-tear" onClick={waiting.onRetry}>Try again</button>
                )}
              </>
            ) : autoTear ? null : (
              <>
                <p className="gift-stage-hint" aria-hidden={busy}>
                  {busy ? " " : "Drag across the top to tear it open"}
                </p>
                <button ref={tearButton} type="button" className="gift-stage-tear" onClick={() => scene.current?.tear(1)} disabled={!ready || busy}>
                  Tear it open
                </button>
            </>
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
