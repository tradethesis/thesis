import { describe, expect, it } from "vitest";

import { idempotencyKey } from "./http";

const req = (key?: string) => new Request("http://x/", { method: "POST", headers: key ? { "idempotency-key": key } : {} });
const uuid = "3f1c2a7e-9b4d-4c11-8e2f-5a6b7c8d9e0f";
const sig = "5".repeat(88);

describe("idempotency keys", () => {
  it("accepts the keys the send flow actually derives", () => {
    for (const key of [uuid, `${uuid}:confirm`, `${uuid}:await`, `${uuid}:fund:${sig}`]) expect(idempotencyKey(req(key))).toBe(key);
  });
  it("refuses missing, short, oversized or odd keys", () => {
    for (const key of [undefined, "short", "x".repeat(201), `${uuid} space`, `${uuid}/slash`]) expect(idempotencyKey(req(key))).toBeInstanceOf(Response);
  });
});
