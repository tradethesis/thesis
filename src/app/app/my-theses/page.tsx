import type { Metadata } from "next";

import { MyTheses } from "@/components/mine/MyTheses";
import { getCalls } from "@/server/calls/service";
import { loadSeries } from "@/server/calls/observations";
import { listPublishedTheses } from "@/server/content/queries";

import "./my-theses.css";

export const metadata: Metadata = {
  title: "My theses",
  description: "What you bought and what you follow.",
};

export const revalidate = 60;

/**
 * The catalogue is fetched on the server; the two personal lists are not. Purchases need the
 * session cookie and are requested by the client from /api/purchases, and the follow list
 * lives in this browser. Neither belongs in a cached server render.
 */
export default async function MyThesesPage() {
  const [theses, calls] = await Promise.all([listPublishedTheses(), getCalls()]);
  // One query for every call on the page rather than one per row.
  const series = Object.fromEntries(await loadSeries(calls.map((c) => c.id)));

  return (
    <>
      <div className="page-head">
        <h1>My theses</h1>
        <p>What you bought, and what you are watching.</p>
      </div>
      <MyTheses theses={theses} calls={calls} series={series} />
    </>
  );
}
