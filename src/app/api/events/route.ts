import { NextResponse } from "next/server";

import { recordEvent, type EventName } from "@/server/events";

export const runtime = "nodejs";

const NAMES: readonly EventName[] = ["thesis_viewed", "thesis_saved", "thesis_unsaved"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records one interaction with the catalogue.
 *
 * Always answers 204, whatever happened. The body is untrusted and the endpoint is public,
 * so the only two outcomes worth distinguishing — "stored" and "rejected" — are exactly the
 * pair that would tell a prober which thesis version ids are real. Nothing downstream reads
 * the response, and a failed count is not a failure a visitor should see.
 *
 * No IP, user agent, or referrer is read or stored. See src/server/events.ts.
 */
export async function POST(request: Request) {
  const noContent = new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noContent;
  }

  if (typeof body !== "object" || body === null) return noContent;
  const { name, thesisVersionId, anonId } = body as Record<string, unknown>;

  if (typeof name !== "string" || !NAMES.includes(name as EventName)) return noContent;
  if (typeof thesisVersionId !== "string" || !UUID.test(thesisVersionId)) return noContent;

  await recordEvent({
    name: name as EventName,
    thesisVersionId,
    anonId: typeof anonId === "string" ? anonId : null,
  });

  return noContent;
}
