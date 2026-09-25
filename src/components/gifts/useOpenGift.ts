"use client";

import { useCallback, useRef, useState } from "react";

import type { GiftPack as Pack } from "@/lib/gifts";
import { getPhantom } from "@/lib/wallet/phantom";
import { usePrivySigner } from "@/lib/wallet/privy-signer";
import {
  base64ToBytes,
  bytesToBase64,
  signWithPhantom,
} from "@/lib/wallet/transaction";

/**
 * Open a reserved gift in one tap: the same buy engine as /buy, run end to end without a screen.
 *
 * create the purchase (from the gift record) → attach it to the gift → quote → for each holding:
 * prepare, sign, send, wait for the chain → settle the gift.
 *
 * Every step is the server's, with the server's checks: the amount and allocation come from the
 * gift record, the purchase is attached before anything is quoted, and a live gift purchase can
 * only be signed while it is attached (intents.ts, prepareLeg). Re-running after a failure resumes:
 * the purchase is keyed to the gift, confirmed holdings are skipped, and an abandoned approval is
 * prepared again.
 */

type Leg = {
  id: string;
  status: string;
  symbol: string;
  errorDetail?: string | null;
};
type Intent = {
  id: string;
  status: string;
  executionMode: "live" | "simulation";
  frozen: { frozen: boolean };
  legs: Leg[];
};

export type OpenProgress =
  | { at: "idle" }
  | { at: "working"; label: string }
  | { at: "done"; partial: boolean }
  | { at: "failed"; message: string };

class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status}).`,
      body?.error?.code,
      body?.error?.detail,
    );
  return body as T;
}

const LEG_WAIT_MS = 90_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A UUID derived from the gift, so every retry names the same purchase. */
async function stableUuid(seed: string): Promise<string> {
  const h = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)),
  ).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; // version 5-style
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function useOpenGift({
  token,
  pack,
  amountUsd,
  intentId = null,
}: {
  token: string;
  pack: Pack | null;
  amountUsd: number | null;
  intentId?: string | null;
}) {
  const privy = usePrivySigner();
  const [progress, setProgress] = useState<OpenProgress>({ at: "idle" });
  const running = useRef(false);

  const open = useCallback(async () => {
    if (running.current || !pack || amountUsd === null) return;
    running.current = true;
    const n = pack.holdings.length;
    const say = (label: string) => setProgress({ at: "working", label });
    try {
      say("Getting your pack ready…");

      // 1. The purchase. An earlier open may already have attached one (the gift is then
      // "delivering" and refuses a second): resume it. Otherwise create one keyed to the gift, so a
      // retry finds the same one instead of a second.
      let intent: Intent;
      if (intentId) {
        intent = await api<Intent>(`/api/intents/${intentId}`);
      } else
        try {
          intent = await api<Intent>("/api/intents", {
            method: "POST",
            body: JSON.stringify({
              slug: pack.buySlug,
              versionId: pack.versionId,
              budgetUsdc: amountUsd,
              idempotencyKey: await stableUuid(`gift-open:${token}`),
              weights: pack.holdings.map((h) => ({
                symbol: h.symbol,
                weightBps: h.weightBps,
              })),
              giftToken: token,
            }),
          });
        } catch (e) {
          const id =
            e instanceof ApiError && e.code === "basket_in_progress"
              ? e.detail?.intentId
              : null;
          if (typeof id !== "string") throw e;
          intent = await api<Intent>(`/api/intents/${id}`);
        }

      // 2. Attach it to the gift before anything is quoted. Already attached is fine.
      if (!intentId) {
        const attached = await api<{ status: string; state?: string }>(
          `/api/gifts/invite/${encodeURIComponent(token)}/deliver`,
          {
            method: "POST",
            headers: { "idempotency-key": `deliver-${intent.id}` },
            body: JSON.stringify({ intentId: intent.id }),
          },
        );
        if (
          attached.status !== "delivering" &&
          !(attached.status === "conflict" && attached.state === "delivering")
        ) {
          throw new Error(
            "This gift couldn't be opened from here. Nothing was bought. Reload and try again.",
          );
        }
      }

      // 3. Quote whatever hasn't been bought.
      if (
        intent.legs.some((l) => l.status === "planned" || l.status === "quoted")
      ) {
        intent = await api<Intent>(`/api/intents/${intent.id}/quote`, {
          method: "POST",
        });
      }

      // 4. One holding at a time; the server refuses to prepare the next while one is in flight.
      for (let i = 0; i < intent.legs.length; i++) {
        const leg = intent.legs[i];
        // Bought already, or ended for good: a failed holding stays failed, and its share stays in
        // the wallet as USDC. The pack opens with what was bought (claimed_partial).
        if (
          ["confirmed", "failed", "expired", "cancelled"].includes(leg.status)
        )
          continue;
        say(`Wrapping ${leg.symbol} · ${i + 1} of ${n}`);

        if (intent.executionMode === "simulation") {
          await api(`/api/intents/${intent.id}/legs/${leg.id}/simulate`, {
            method: "POST",
          });
          continue;
        }

        if (
          leg.status === "planned" ||
          leg.status === "quoted" ||
          leg.status === "awaiting_signature"
        ) {
          // A route can be briefly unavailable ("quote not available from market maker" on thinner
          // tokens); nothing is signed until a prepare succeeds, so asking again is safe.
          const prepare = async () => {
            for (let attempt = 1; ; attempt++) {
              try {
                return await api<{ outcome: string; transactionB64?: string }>(
                  `/api/intents/${intent.id}/legs/${leg.id}/prepare`,
                  { method: "POST" },
                );
              } catch (e) {
                if (attempt >= 3) throw e;
                await wait(1500 * attempt);
              }
            }
          };
          let prepared = await prepare();
          if (prepared.outcome === "terms_changed") {
            // The price moved since the quote. The recipient asked for the pack, not a price: take
            // a fresh quote (the server's order checks still apply) and prepare once more.
            await api(`/api/intents/${intent.id}/quote`, { method: "POST" });
            prepared = await prepare();
            if (prepared.outcome !== "ready")
              throw new Error(
                "Prices are moving fast right now. Try again in a minute.",
              );
          }
          let signed: string;
          if (privy?.signTransaction) {
            signed = bytesToBase64(
              await privy.signTransaction(
                base64ToBytes(prepared.transactionB64!),
              ),
            );
          } else {
            const phantom = getPhantom();
            if (!phantom)
              throw new Error(
                "Your wallet isn't available. Sign in again and retry.",
              );
            signed = await signWithPhantom(prepared.transactionB64!, phantom);
          }
          await api(`/api/intents/${intent.id}/legs/${leg.id}/execute`, {
            method: "POST",
            body: JSON.stringify({ signedTransaction: signed }),
          });
        }

        // Wait for the chain before the next holding.
        const until = Date.now() + LEG_WAIT_MS;
        for (;;) {
          intent = await api<Intent>(`/api/intents/${intent.id}`);
          const now = intent.legs.find((l) => l.id === leg.id);
          if (now?.status === "confirmed") break;
          if (now && ["failed", "expired", "cancelled"].includes(now.status))
            break;
          if (Date.now() > until)
            throw new Error(
              "The network is slow right now. Your gift is safe; try again in a minute.",
            );
          await wait(2000);
        }
      }

      // 5. Settle the gift from the purchase's own reconciled status.
      say("Sealing it up…");
      intent = await api<Intent>(`/api/intents/${intent.id}`);
      await api(`/api/gifts/invite/${encodeURIComponent(token)}/settle`, {
        method: "POST",
      }).catch(() => {});
      const confirmed = intent.legs.filter(
        (l) => l.status === "confirmed",
      ).length;
      setProgress({ at: "done", partial: confirmed < intent.legs.length });
    } catch (e) {
      setProgress({
        at: "failed",
        message: (e as Error).message || "Something went wrong. Try again.",
      });
    } finally {
      running.current = false;
    }
  }, [token, pack, amountUsd, intentId, privy]);

  return { progress, open };
}
