import { NextResponse } from "next/server";
import { jsonSafe } from "@/lib/json";
import { getSession } from "./session";
import { IntentError } from "./execution/intents";
import { AllocationError } from "@/lib/money/allocate";

/**
 * One place where every route turns work into a response.
 *
 * Auth is not optional and not per-route: `authed` is the only way to get a wallet, so a
 * route cannot forget to check (TH-06). Errors are mapped once, so a caller never sees a
 * stack trace and every failure carries a code the UI can branch on.
 */

export const ok = (data: unknown, init?: number) => NextResponse.json(jsonSafe(data), { status: init ?? 200 });

export const err = (code: string, message: string, status = 400) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function authed<T>(handler: (wallet: string) => Promise<T>) {
  const session = await getSession();
  if (!session) return err("not_signed_in", "Connect your wallet to continue.", 401);
  return guard(() => handler(session.wallet));
}

export async function guard<T>(handler: () => Promise<T>) {
  try {
    return ok(await handler());
  } catch (error) {
    if (error instanceof IntentError) {
      const status = error.code === "not_yours" ? 403 : error.code === "not_found" ? 404 : 400;
      return err(error.code, error.message, status);
    }
    if (error instanceof AllocationError) return err(error.code, error.message, 400);
    console.error("[api]", error);
    return err("internal", "Something went wrong on our side.", 500);
  }
}
