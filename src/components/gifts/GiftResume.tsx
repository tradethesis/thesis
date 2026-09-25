"use client";

import { useEffect, useState } from "react";

import { SignIn } from "@/components/buy/SignIn";
import { useWallet } from "@/components/buy/useWallet";
import type { GiftDraft, GiftPack as Pack } from "@/lib/gifts";

import { GiftPack } from "./GiftPack";
import { GiftSend } from "./GiftSend";
import { GiftFooter, GiftHeader } from "./GiftShell";

type Row = { packId: string; basketVersionId: string; amountUsd: number; senderName: string; note: string; recipientHandleRequested: string };

/**
 * A sender's own gift, reopened. Everything shown comes from the server's record, and only to the
 * wallet that created it: signed out or signed in as somebody else, there is nothing here.
 */
export function GiftResume({ giftId }: { giftId: string }) {
  const w = useWallet();
  const [row, setRow] = useState<Row | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [state, setState] = useState<"loading" | "signed_out" | "missing" | "ready">("loading");

  useEffect(() => {
    let live = true;
    fetch(`/api/gifts/${encodeURIComponent(giftId)}`)
      .then(async (r) => {
        if (r.status === 401) return live && setState("signed_out");
        const b = (await r.json()) as { status: string; gift?: Row };
        if (!live) return;
        if (b.status !== "ok" || !b.gift) return setState("missing");
        const p = await fetch(`/api/gifts/packs/${encodeURIComponent(b.gift.packId)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (!live) return;
        setRow(b.gift);
        setPack((p as { pack?: Pack } | null)?.pack ?? null);
        setState(p ? "ready" : "missing");
      })
      .catch(() => live && setState("missing"));
    return () => { live = false; };
  }, [giftId, w.wallet]);

  const draft: GiftDraft | null = row && pack ? { packId: row.packId, versionId: row.basketVersionId, amount: row.amountUsd, recipient: row.recipientHandleRequested, sender: row.senderName, message: row.note } : null;

  return (
    <div className="gift-site"><GiftHeader />
      <main className="gift-resume" id="main">
        {state === "loading" && <p className="gift-loading" role="status">Finding your gift…</p>}
        {state === "signed_out" && <section className="gift-resume-card"><h1>Your gift</h1><p>Sign in with the wallet you sent it from.</p><SignIn wallet={w} /></section>}
        {state === "missing" && <section className="gift-resume-card"><h1>No gift here.</h1><p>This isn&rsquo;t a gift you started, or it no longer exists.</p></section>}
        {state === "ready" && draft && pack && (
          <section className="gift-resume-card">
            <p className="gift-eyebrow">YOUR GIFT TO @{draft.recipient.toUpperCase()}</p>
            <div className="gift-resume-pack"><GiftPack pack={pack} /></div>
            <GiftSend draft={draft} pack={pack} resumeGiftId={giftId} inline />
          </section>
        )}
      </main>
      <GiftFooter />
    </div>
  );
}
