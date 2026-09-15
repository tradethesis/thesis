import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { refreshCalls } from "@/server/calls/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ calls: await refreshCalls() });
}
