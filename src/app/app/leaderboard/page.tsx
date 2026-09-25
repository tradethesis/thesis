import type { Metadata } from "next";

import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { getCalls, refreshCallsIfStale } from "@/server/calls/service";
import { after } from "next/server";
import { crowdStandings } from "@/server/conviction";
import { authorOf } from "@/components/calls/ThesisAuthor";
import { listPublishedTheses } from "@/server/content/queries";
import { db } from "@/server/db/client";
import { thesisVersion } from "@/server/db/schema";
import { inArray } from "drizzle-orm";

import "./leaderboard.css";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Which calls are working, measured against their benchmark from a fixed starting snapshot.",
};

export const revalidate = 60;
// Room for a background refresh of the calls when they have gone stale (see refreshCallsIfStale).
export const maxDuration = 60;

export default async function LeaderboardPage() {
  // Keep the record current without waiting on a scheduler: stale calls refresh after this responds.
  after(() => refreshCallsIfStale());
  const [theses, calls, standings] = await Promise.all([listPublishedTheses(), getCalls(), crowdStandings()]);
  // A call is struck on one version of a thesis. Its row shows that version's own claim, so a
  // thesis re-worded since does not appear twice under its newest title.
  const versionIds = [...new Set(calls.map((c) => c.versionId))];
  const versionRows = versionIds.length
    ? await db.select({ id: thesisVersion.id, claim: thesisVersion.claim, number: thesisVersion.versionNumber }).from(thesisVersion).where(inArray(thesisVersion.id, versionIds))
    : [];
  const versions = Object.fromEntries(versionRows.map((v) => [v.id, { claim: v.claim, number: v.number }]));
  // The crowd table ranks beliefs, and a belief is somebody's — so each row carries who.
  const byThesis = new Map(theses.map((t) => [t.thesisId, t]));
  const crowd = standings.map((s) => ({
    ...s,
    author: authorOf(byThesis.get(s.thesisId) ?? { authorName: "Thesis editorial", authorHandle: null, sourcePost: null }),
  }));

  return (
    <>
      <div className="page-head">
        <h1>Leaderboard</h1>
        <p>Every basket is a 90-day call against the S&amp;P 500. Live calls update daily; each is scored when it ends.</p>
      </div>
      <Leaderboard theses={theses} calls={calls} crowd={crowd} versions={versions} />
    </>
  );
}
