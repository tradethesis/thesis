import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { waitlistSignup } from "@/server/db/schema";
import { parseWaitlist } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Join the waitlist.
 *
 * Two properties worth stating, because both are easy to get wrong:
 *
 *   1. **The answer is the same whether or not the address was already on the list.**
 *      Telling a caller "you are already registered" turns the form into an oracle for
 *      whether a given person uses this product. `on conflict do nothing` plus one fixed
 *      response closes that.
 *   2. **Nothing is recorded that was not typed in.** No IP address, no user agent, no
 *      referrer. The only provenance kept is the page name, and it is validated against a
 *      strict pattern so a tracking string cannot be smuggled through it.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseWaitlist(body ?? {});

  if (!parsed.ok) {
    return NextResponse.json({ error: { field: parsed.field, message: parsed.message } }, { status: 400 });
  }

  try {
    await db.insert(waitlistSignup).values(parsed.value).onConflictDoNothing({ target: waitlistSignup.email });
  } catch (error) {
    console.error("[waitlist]", error);
    return NextResponse.json(
      { error: { field: "email", message: "We could not save that just now. Try again in a moment." } },
      { status: 500 },
    );
  }

  // Deliberately identical for a new signup and a repeat.
  return NextResponse.json({ ok: true });
}
