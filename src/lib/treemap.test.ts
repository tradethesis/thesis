import { describe, expect, it } from "vitest";

import { squarify } from "./treemap";

const area = (r: { width: number; height: number }) => r.width * r.height;

describe("squarify", () => {
  const items = [
    { key: "a", value: 40 },
    { key: "b", value: 25 },
    { key: "c", value: 20 },
    { key: "d", value: 10 },
    { key: "e", value: 5 },
  ];

  it("gives every item a rectangle", () => {
    expect(squarify(items).map((r) => r.key).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("makes area proportional to value, which is the only claim it makes", () => {
    const rects = squarify(items, 100, 100);
    const total = rects.reduce((sum, r) => sum + area(r), 0);
    for (const r of rects) {
      expect(area(r) / total).toBeCloseTo(r.value / 100, 3);
    }
  });

  it("fills the container without spilling out of it", () => {
    const rects = squarify(items, 100, 60);
    expect(rects.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(6000, 2);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.width).toBeLessThanOrEqual(100 + 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(60 + 1e-6);
    }
  });

  it("never overlaps two rectangles", () => {
    const rects = squarify(items, 100, 100);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart =
          a.x + a.width <= b.x + 1e-6 ||
          b.x + b.width <= a.x + 1e-6 ||
          a.y + a.height <= b.y + 1e-6 ||
          b.y + b.height <= a.y + 1e-6;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps rectangles closer to square than a naive slice would", () => {
    // A plain slice-and-dice of five items across 100x100 gives the smallest a 100:5 strip,
    // an aspect ratio of 20. Squarifying has to do better than that or it is pointless.
    const worst = Math.max(...squarify(items).map((r) => Math.max(r.width / r.height, r.height / r.width)));
    expect(worst).toBeLessThan(5);
  });

  it("drops values that cannot be drawn rather than inventing a minimum", () => {
    expect(squarify([{ key: "a", value: 5 }, { key: "b", value: 0 }])).toHaveLength(1);
    expect(squarify([])).toEqual([]);
    expect(squarify(items, 0, 100)).toEqual([]);
  });
});
