import { describe, expect, it } from "vitest";
import { allocateGiftCents, giftDraftSchema, giftPreviewPath, readGiftPreview } from "./gifts";
const draft = { packId: "ai", versionId: "v1", recipient: "@kayle_build", sender: "A friend", message: "Here's to 你好 & your future #1", amount: 100 };
describe("gift previews", () => {
  it("keeps personal text in the fragment and round trips unicode", () => {
    const path = giftPreviewPath(draft);
    expect(path.split("#")[0]).toBe("/gift/preview");
    expect(readGiftPreview(path.slice(path.indexOf("#")))).toEqual({ ...draft, recipient: "kayle_build" });
  });
  it("rejects malformed and oversized links without throwing", () => {
    for (const input of ["", "#%ZZ", "#null", "#{}", "#" + "a".repeat(5001)]) expect(readGiftPreview(input)).toBeNull();
  });
  it("requires an actual handle shape and bounded whole-dollar budget", () => {
    for (const recipient of ["", "hello world", "x.com/person", "a".repeat(16), "@@name"]) expect(giftDraftSchema.safeParse({ ...draft, recipient }).success).toBe(false);
    for (const amount of [0, -10, 25.5, 1001, Infinity]) expect(giftDraftSchema.safeParse({ ...draft, amount }).success).toBe(false);
    for (const amount of [1, 9, 1000]) expect(giftDraftSchema.safeParse({ ...draft, amount }).success).toBe(true);
    expect(giftDraftSchema.safeParse({ ...draft, message: "a".repeat(241) }).success).toBe(false);
  });
  it("conserves cents across fractional weight allocations", () => {
    expect(allocateGiftCents(25, [4000, 3000, 3000])).toEqual([1000, 750, 750]);
    const allocation = allocateGiftCents(10, [3333, 3333, 3334]);
    expect(allocation).toEqual([333, 333, 334]);
    expect(allocation.reduce((a, b) => a + b)).toBe(1000);
    expect(() => allocateGiftCents(25, [5000, 4000])).toThrow();
  });
});
