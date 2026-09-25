import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The identity rules of the conviction endpoint.
 *
 * This is the only write path in the app that a caller with no wallet can reach, so the
 * question it has to answer correctly every time is "whose record is this?". The answer
 * comes from the session or from a header, and never from the request body. These tests
 * exist to make that hard to undo: an endpoint that accepts an owner as a parameter reads
 * and writes anybody's record for whoever asks, and it is always introduced as a
 * convenience by somebody who did not know the rule.
 *
 * The storage layer is mocked on purpose. What is under test is the route's decision about
 * identity, not Postgres.
 */

const getSession = vi.fn();
const takeSide = vi.fn();
const clearSide = vi.fn();
const scoredForOwner = vi.fn();

vi.mock("@/server/session", () => ({ getSession }));
vi.mock("@/server/conviction", async () => {
  const actual = await vi.importActual<typeof import("@/server/conviction")>("@/server/conviction");
  return { isValidOwner: actual.isValidOwner, takeSide, clearSide, scoredForOwner };
});

const { GET, POST, DELETE } = await import("./route");

const THESIS = "25085401-a4b3-4a33-a9e8-e8da605dae34";
const ANON = "anon_abcdefgh";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/conviction", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(null);
  takeSide.mockResolvedValue({ thesisId: THESIS, side: "backing" });
  scoredForOwner.mockResolvedValue([]);
});

describe("who the caller is", () => {
  it("refuses a write with no session and no anonymous id", async () => {
    const res = await POST(post({ thesisId: THESIS, side: "backing" }));
    expect(res.status).toBe(401);
    expect(takeSide).not.toHaveBeenCalled();
  });

  it("refuses a delete with no identity", async () => {
    const res = await DELETE(new Request(`http://localhost/api/conviction?thesisId=${THESIS}`, { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(clearSide).not.toHaveBeenCalled();
  });

  it("ignores an owner named in the body and writes for the caller", async () => {
    await POST(
      post(
        { thesisId: THESIS, side: "backing", ownerKind: "wallet", ownerKey: "SomebodyElsesWallet1111111111" },
        { "x-thesis-anon": ANON },
      ),
    );
    expect(takeSide).toHaveBeenCalledWith({ kind: "anon", key: ANON }, THESIS, "backing");
  });

  it("prefers the signed-in wallet over any anonymous id sent with it", async () => {
    getSession.mockResolvedValue({ wallet: "WalletOfTheSignedInPerson11" });
    await POST(post({ thesisId: THESIS, side: "doubting" }, { "x-thesis-anon": ANON }));
    expect(takeSide).toHaveBeenCalledWith({ kind: "wallet", key: "WalletOfTheSignedInPerson11" }, THESIS, "doubting");
  });

  it("reads back only the caller's own rows", async () => {
    await GET(new Request("http://localhost/api/conviction", { headers: { "x-thesis-anon": ANON } }));
    expect(scoredForOwner).toHaveBeenCalledWith({ kind: "anon", key: ANON });
  });

  it("returns an empty list rather than an error when nobody is identified", async () => {
    const res = await GET(new Request("http://localhost/api/conviction"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ convictions: [] });
    expect(scoredForOwner).not.toHaveBeenCalled();
  });

  it("refuses an anonymous id that is too short to be one it issued", async () => {
    const res = await POST(post({ thesisId: THESIS, side: "backing" }, { "x-thesis-anon": "short" }));
    expect(res.status).toBe(401);
  });
});

describe("what the caller may say", () => {
  it("rejects a thesis id that is not a uuid", async () => {
    const res = await POST(post({ thesisId: "../../etc/passwd", side: "backing" }, { "x-thesis-anon": ANON }));
    expect(res.status).toBe(400);
    expect(takeSide).not.toHaveBeenCalled();
  });

  it("rejects a side that is neither backing nor doubting", async () => {
    const res = await POST(post({ thesisId: THESIS, side: "unsure" }, { "x-thesis-anon": ANON }));
    expect(res.status).toBe(400);
    expect(takeSide).not.toHaveBeenCalled();
  });

  it("answers not-found identically for a missing and an unpublished thesis", async () => {
    // Two different facts, one answer, so a probe cannot use this endpoint to discover
    // that an unpublished thesis exists.
    takeSide.mockResolvedValue(null);
    const res = await POST(post({ thesisId: THESIS, side: "backing" }, { "x-thesis-anon": ANON }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });
});
