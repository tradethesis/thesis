import { db } from "./db/client";
import { event } from "./db/schema";

/**
 * Append-only record of what people do with the catalogue.
 *
 * The table has existed since the schema was written and nothing has ever written to it,
 * which is why the call cards show a scoreboard where a catalogue would normally show
 * popularity: there is no popularity to show, and inventing one is not on the table.
 * This starts the counting so that a real number exists later.
 *
 * What is deliberately absent: no wallet address, no email, no IP, no user agent, no
 * referrer. The anonymous id is a random value the browser keeps, and it exists only so
 * that one person reloading a thesis eight times is not eight people. Nothing here can be
 * joined back to an individual, which is the condition for recording anything at all.
 */

export type EventName = "thesis_viewed" | "thesis_saved" | "thesis_unsaved";

export async function recordEvent(input: {
  name: EventName;
  thesisVersionId?: string | null;
  anonId?: string | null;
  props?: Record<string, unknown> | null;
}): Promise<void> {
  // Analytics must never be able to fail a page. A view that is not counted is a rounding
  // error; a thesis that will not render because its counter threw is an outage.
  try {
    await db.insert(event).values({
      name: input.name,
      thesisVersionId: input.thesisVersionId ?? null,
      anonId: normaliseAnonId(input.anonId),
      props: input.props ?? null,
    });
  } catch {
    // Swallowed on purpose. See above.
  }
}

/**
 * The anonymous id as stored: a bounded, opaque string or nothing at all.
 *
 * The value arrives from the client, so it is treated as untrusted input rather than as an
 * identifier we issued — anything oversized or oddly shaped is dropped rather than
 * persisted, and dropping it costs only de-duplication.
 */
function normaliseAnonId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}
