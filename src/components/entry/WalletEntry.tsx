"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { safeNext } from "@/lib/safe-next";

import { useWallet } from "../buy/useWallet";
import { BrandMark } from "../landing/BrandMark";


/**
 * The front door.
 *
 * One action. No hero essay, no feature grid, no waitlist form, no footer of links — the product
 * is behind this button and everything else is delay.
 *
 * The three states that matter are kept apart, because conflating them is what makes an entry
 * screen feel broken:
 *
 *   - **Not checked yet.** `ready` is false. Nothing is offered, because offering "Connect
 *     wallet" to somebody who is already signed in and then replacing it a moment later is a
 *     flash that reads as a bug.
 *   - **Checked, signed in.** Leave immediately for wherever they were going.
 *   - **Checked, signed out.** The button.
 *
 * Entering happens when the *server* has verified a signature, never when an address appears. A
 * connected wallet proves somebody has an address; only the signature proves they control it, and
 * only the session cookie authorises anything.
 */
export function WalletEntry() {
  const { wallet, ready, connect, connectWithEmail, hasPhantom, hasEmailSignIn, connecting, signingIn, error } =
    useWallet();
  const router = useRouter();
  const params = useSearchParams();
  const [leaving, setLeaving] = useState(false);

  const next = safeNext(params.get("next"));

  /*
   * Stop the room when nobody is in it.
   *
   * A hidden tab stops requestAnimationFrame but keeps CSS animation clocks running, so a
   * backgrounded entry screen would go on repainting a drawing nobody can see.
   */
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!ready || !wallet || leaving) return;
    setLeaving(true);
    router.replace(next);
  }, [ready, wallet, leaving, next, router]);

  const busy = connecting || signingIn || leaving;

  return (
    <main className={`ent ${hidden ? "ent-still" : ""}`}>
      {/*
        * The room behind the button.
        *
        * A generated photograph rather than the drawn SVG that used to sit here. Two widths: a
        * phone at `cover` only ever sees the middle quarter of the wide frame, so it is served a
        * pre-cropped one instead of 1824 pixels of wall it will throw away.
        *
        * There is no text and no numeral anywhere in this picture, which is the one hard rule for
        * this surface — a fake price on the front door of a product that sells real exposure is
        * the thing it must never show. Candidates that put writing on screens were rejected for
        * exactly that; see scripts/gen-entry-art.py, which keeps the rejected prompt as a record.
        *
        * Decoration, so `aria-hidden` and no alt text worth reading aloud.
        */}
      <div className="ent-scene" aria-hidden="true">
        <picture>
          <source media="(max-width: 767.98px)" srcSet="/entry/hall-narrow.webp" />
          <img className="ent-art" src="/entry/hall.webp" alt="" width={1824} height={1024} decoding="async" />
        </picture>
        <div className="ent-scrim" />
      </div>

      <div className="ent-panel">
        <p className="ent-mark">
          <BrandMark />
          <span>thesis</span>
        </p>

        <h1 className="ent-line">Buy what you believe.</h1>

        {!ready ? (
          <p className="ent-status" role="status">
            Checking your session…
          </p>
        ) : wallet ? (
          <p className="ent-status" role="status">
            Opening the terminal…
          </p>
        ) : (
          <>
            <button type="button" className="ln-btn ln-btn--ink ent-cta" onClick={() => void connect()} disabled={busy}>
              {signingIn ? "Waiting for your signature…" : connecting ? "Connecting…" : "Connect wallet"}
            </button>

            {hasEmailSignIn && (
              <button type="button" className="ent-alt" onClick={() => void connectWithEmail()} disabled={busy}>
                or continue with email
              </button>
            )}

            {!hasPhantom && !hasEmailSignIn && (
              <p className="ent-note">
                You will need a Solana wallet.{" "}
                <a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer">
                  Get Phantom
                </a>
              </p>
            )}

            {error && (
              <p className="ent-error" role="alert">
                {error}{" "}
                <button type="button" onClick={() => void connect()}>
                  Try again
                </button>
              </p>
            )}
          </>
        )}
      </div>

      <footer className="ent-foot">
        <Link href="/about">About</Link>
        <a href="/llms.txt">For machines</a>
      </footer>
    </main>
  );
}
