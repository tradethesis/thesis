"use client";

import confetti from "canvas-confetti";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GiftPack as Pack } from "@/lib/gifts";
import { buzz, crinkle, isMuted, pop, rip, setMuted, whooshes } from "@/lib/gift-sound";

import { GiftPack } from "./GiftPack";

/**
 * Opening a pack, the way a foil trading-card pack opens.
 *
 *   hover   the pack tilts toward the pointer in 3D and its foil catches the light
 *   drag    the crimped seal curls up toward you under your finger, crinkling
 *   rip     past halfway (or on a flick) the strip tears free and flies off
 *   burst   the pack jolts, light spills out of the opening, confetti, a soft pop
 *   drop    the empty pack falls back into the page and the contents take over
 *
 * A button does the whole thing for keyboards. Reduced motion skips straight to the contents.
 *
 * ## What it may reveal
 *
 * Only what already exists: the disclosed allocation in a preview, chain-confirmed holdings in a
 * funded gift. It never plays over a purchase in flight. The celebration is the same for every gift —
 * it marks a friend's gift being opened, not an amount — and nothing counts up.
 *
 * ## How it is built
 *
 * The pack is drawn twice and each copy clipped along one zigzag: the top copy is the seal strip, the
 * bottom copy the body. Clips never move; only transform and opacity animate, inside one
 * `preserve-3d` layer under a perspective. Pointer position is written straight to CSS variables on
 * that layer, so tilting re-renders nothing. The gesture uses pointer capture and completes on
 * distance or speed.
 */

const TEAR_Y = 30;
const TEETH = 22;
const DEPTH = 5;
/** The scene's top padding in gifts.css (.rip-scene), room for the strip to curl into. */
const PAD = 18;

function zigzag(): string {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) pts.push(`${((i / TEETH) * 100).toFixed(2)}% ${TEAR_Y + (i % 2 ? DEPTH : 0)}px`);
  return pts.join(", ");
}
const EDGE = zigzag();
const STRIP_CLIP = `polygon(0 0, 100% 0, ${EDGE.split(", ").reverse().join(", ")})`;
const BODY_CLIP = `polygon(${EDGE}, 100% 100%, 0 100%)`;

/** Each pack's own ink, alongside the brand orange, paper and a little gold. */
const PACK_INK: Record<Pack["color"], string> = { blue: "#34469a", green: "#2f6b45", red: "#e04e24", gold: "#b8862e" };

type Phase = "sealed" | "dragging" | "tearing" | "burst" | "torn";

export function PackRip({
  pack,
  onOpened,
  label = "Tear it open",
  children,
  buttonRef,
  cards = 3,
  image,
}: {
  pack: Pack;
  onOpened: () => void;
  label?: string;
  /** Anything that sits on the pack, such as the budget stamp. It falls away with the body. */
  children?: React.ReactNode;
  /** So a "replay" elsewhere can return focus to the tear button. */
  buttonRef?: React.Ref<HTMLButtonElement>;
  /** How many cards fly out, for their whooshes. */
  cards?: number;
  /** The sender's photo for the middle of the pack. */
  image?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("sealed");
  const [progress, setProgress] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [muted, setMutedState] = useState(false);
  const drag = useRef<{ x0: number; t0: number; width: number; lastGrain: number } | null>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  // Read the remembered choice after mount, so the server render and the first client render agree.
  useEffect(() => setMutedState(isMuted()), []);

  /*
   * The sequence advances on transitionend and animationend. Those can fail to arrive — a tab in the
   * background, a style that never changed — so each step also has a deadline a little past its
   * duration. Whichever comes first moves on; the refs keep a step from running twice.
   */
  useEffect(() => {
    if (phase === "tearing") {
      const t = setTimeout(burst, 700);
      return () => clearTimeout(t);
    }
    if (phase === "burst") {
      const t = setTimeout(() => setPhase("torn"), 650);
      return () => clearTimeout(t);
    }
    if (phase === "torn") {
      const t = setTimeout(finish, 750);
      return () => clearTimeout(t);
    }
    // burst and finish are stable in effect: they only read refs and props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function finish() {
    if (opened.current) return;
    opened.current = true;
    whooshes(cards);
    onOpened();
  }

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) pop();
  }

  function tear(direction: 1 | -1) {
    if (phase === "tearing" || phase === "burst" || phase === "torn") return;
    if (reduced()) {
      opened.current = true;
      onOpened();
      return;
    }
    setDir(direction);
    setProgress(1);
    setPhase("tearing");
    rip();
    buzz(14);
  }

  function burst() {
    if (phase !== "tearing") return;
    setPhase("burst");
    pop();
    buzz([8, 40, 12]);
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + PAD + TEAR_Y) / window.innerHeight };
    const small = window.innerWidth < 600;
    const colors = ["#fe6847", PACK_INK[pack.color], "#f7f1e3", "#f2c265", "#ffffff"];
    const base = { origin, colors, disableForReducedMotion: true, scalar: small ? 0.8 : 1, ticks: 220, zIndex: 60 };
    void confetti({ ...base, particleCount: small ? 55 : 90, spread: 70, startVelocity: small ? 38 : 48, angle: 90 });
    void confetti({ ...base, particleCount: small ? 22 : 36, spread: 50, startVelocity: 32, angle: 60, drift: 0.4 });
    void confetti({ ...base, particleCount: small ? 22 : 36, spread: 50, startVelocity: 32, angle: 120, drift: -0.4 });
  }

  /* ---- tilt: pointer position straight onto CSS variables, no re-render ---- */

  function onHover(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || phase !== "sealed" || !tilt.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    tilt.current.style.setProperty("--mx", ((e.clientX - r.left) / r.width).toFixed(3));
    tilt.current.style.setProperty("--my", ((e.clientY - r.top) / r.height).toFixed(3));
  }
  function onLeave() {
    tilt.current?.style.setProperty("--mx", "0.5");
    tilt.current?.style.setProperty("--my", "0.5");
  }

  /* ---- the tear gesture ---- */

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed") return;
    const r = e.currentTarget.getBoundingClientRect();
    // Only the seal tears. Grabbing the middle of the pack is not how anybody opens one.
    if (e.clientY - r.top > PAD + TEAR_Y + 44) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: performance.now(), width: r.width, lastGrain: 0 };
    setPhase("dragging");
    crinkle(0.3);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    onHover(e);
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (dx !== 0) setDir(dx > 0 ? 1 : -1);
    const p = Math.min(1, Math.abs(dx) / (d.width * 0.85));
    setProgress(p);
    // A grain of foil every few percent of tear, louder the faster it goes.
    if (p - d.lastGrain > 0.045) {
      const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t0);
      crinkle(Math.min(1, speed * 1.5));
      d.lastGrain = p;
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const dx = e.clientX - d.x0;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t0); // px per ms
    if (progress > 0.55 || speed > 0.6) tear(dx >= 0 ? 1 : -1);
    else {
      setPhase("sealed");
      setProgress(0);
    }
  }

  return (
    <div className={`rip rip--${phase}`} style={{ "--p": progress, "--dir": dir } as React.CSSProperties}>
      <div className="rip-top">
        <p className="rip-hint" aria-hidden="true">
          <span>Tear here</span>
          <svg width="34" height="10" viewBox="0 0 34 10" fill="none"><path d="M1 5h30m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </p>
        <button type="button" className="rip-sound" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
          {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
        </button>
      </div>

      <div
        className="rip-scene"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onLeave}
        aria-hidden="true"
      >
        <div className="rip-tilt" ref={tilt}>
          <div
            className="rip-body"
            style={{ clipPath: BODY_CLIP }}
            onAnimationEnd={(e) => {
              if (e.animationName === "rip-pop" && phase === "burst") setPhase("torn");
              if (e.animationName === "rip-sink") finish();
            }}
          >
            <GiftPack pack={pack} image={image} />
            <span className="rip-foil" />
            <span className="rip-sheen" />
          </div>
          {children && <div className="rip-extras">{children}</div>}
          <div
            className="rip-strip"
            style={{ clipPath: STRIP_CLIP }}
            onTransitionEnd={(e) => {
              if (e.propertyName === "transform" && phase === "tearing") burst();
            }}
          >
            <GiftPack pack={pack} image={image} />
            <span className="rip-foil" />
          </div>
          <span className="rip-light" />
        </div>
      </div>

      <button ref={buttonRef} type="button" className="gift-button rip-button" onClick={() => tear(1)} disabled={phase !== "sealed" && phase !== "dragging"}>
        {label}
      </button>
      <p className="rip-sr" role="status">{phase === "torn" ? "The pack is open." : ""}</p>
    </div>
  );
}
