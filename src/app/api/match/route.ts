import { NextResponse } from "next/server";

import { jsonSafe } from "@/lib/json";
import { matchStream, MAX_INPUT } from "@/server/match/match";

/**
 * Matching an idea to the catalogue.
 *
 * Public and unauthenticated on purpose: a visitor sees results before connecting anything, and
 * the wallet is asked for only when buying or saving needs it. That makes this the one route that
 * spends model budget for somebody who has not identified themselves, so it carries its own limits
 * rather than relying on a session it does not have.
 *
 * **What is kept.** Each search and its outcome are written to `match_query`, because the catalogue
 * cannot tell you what is missing from it and a search that matches nothing can. That row holds the
 * text and the result and nothing else: no wallet, no session, no address, no user agent. Server
 * logs still carry only the shape of a failure, never its content.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * A small fixed-window limiter, per address, in memory.
 *
 * Honest about what it is: one process's view of one window. It stops a tab hammering the endpoint
 * and a casual script; it is not a defence against a distributed caller, and a serverless
 * deployment will hold several of these at once. Anything stronger belongs at the edge, and
 * pretending otherwise in a comment is how a placeholder becomes load-bearing.
 */
const WINDOW_MS = 60_000;
/*
 * Thirty a minute. Twelve was the first figure and it was too tight: somebody searching, reading,
 * editing and resubmitting a few times is doing exactly what this page is for, and the browser
 * suite tripped it halfway through a run. Thirty still stops a tab hammering the endpoint while
 * leaving an ordinary session far below the line.
 */
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function allow(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now >= row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  row.count += 1;
  return { ok: row.count <= MAX_PER_WINDOW, retryAfter: Math.ceil((row.resetAt - now) / 1000) };
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const gate = allow(ip);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many searches. Try again in a moment." } },
      { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "bad_request", message: "Send JSON." } }, { status: 400 });
  }

  const input = typeof (body as { input?: unknown })?.input === "string" ? (body as { input: string }).input : "";
  const trimmed = input.trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: { code: "empty", message: "Paste a link or describe the idea." } },
      { status: 400 },
    );
  }
  if (input.length > MAX_INPUT) {
    return NextResponse.json(
      { error: { code: "too_long", message: `That is longer than ${MAX_INPUT} characters.` } },
      { status: 413 },
    );
  }

  /*
   * Newline-delimited JSON, one object per event.
   *
   * The page shows each basket the moment its judgement comes back, so the stream is the feature
   * rather than an optimisation: what moves on screen is real work landing. NDJSON over SSE because
   * there is nothing to subscribe to — this is one response that happens to arrive in pieces.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of matchStream(trimmed)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(jsonSafe(event))}\n`));
        }
      } catch (error) {
        // The shape of the failure, never the input that caused it.
        console.error("[match]", error instanceof Error ? error.name : "unknown");
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "failed", result: { status: "error", query: trimmed, message: "Matching failed. Try again." } })}\n`,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Proxies that buffer would turn a live readout back into a spinner.
      "x-accel-buffering": "no",
    },
  });
}
