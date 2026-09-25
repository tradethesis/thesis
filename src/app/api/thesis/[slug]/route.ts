import { basketKey } from "@/lib/calls";
import { getCalls } from "@/server/calls/service";
import { activityForTheses } from "@/server/conviction";
import { getPublishedThesis } from "@/server/content/detail";

export const runtime = "nodejs";
export const revalidate = 60;

const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * One published thesis, for the detail drawer.
 *
 * The drawer can be opened from anywhere — the feed, either rail, a link somebody pasted —
 * so it fetches by slug rather than being handed data by whichever surface happened to
 * render it. Read-only, published only, and no wallet: there is nothing here a visitor
 * could not already read at /t/<slug>, which remains the real page.
 *
 * The call is matched on the thesis and its basket, the same way the card does it, so a
 * later prose-only edit does not strand a call that is still running.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return Response.json({ error: "bad_request" }, { status: 400 });

  const detail = await getPublishedThesis(slug);
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });

  const key = basketKey(detail.holdings);
  const call = (await getCalls()).find((c) => c.thesisId === detail.thesisId && c.basketKey === key) ?? null;

  const activity = (await activityForTheses([detail.thesisId])).get(detail.thesisId) ?? null;
  return Response.json({ thesis: detail, call, activity });
}
