export type TreemapItem = { key: string; value: number };
export type TreemapRect = { key: string; value: number; x: number; y: number; width: number; height: number };

/**
 * Squarified treemap layout.
 *
 * Area is the only thing that carries meaning here, so the algorithm's job is to keep each
 * rectangle's area proportional to its value while keeping aspect ratios close to square —
 * a long thin sliver is the same area as a square one and reads as far less, which would
 * make the chart lie about its own numbers.
 *
 * Bruls, Huizing and van Wijk's method: fill the shorter edge of the remaining space with a
 * row, adding items while the worst aspect ratio in that row improves, then recurse on what
 * is left.
 *
 * Returns percentages of the container, not pixels, so the caller can size it however it
 * likes without re-running this.
 */
export function squarify(items: TreemapItem[], width = 100, height = 100): TreemapRect[] {
  const usable = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (!usable.length || width <= 0 || height <= 0) return [];

  const total = usable.reduce((sum, i) => sum + i.value, 0);
  // Work in area units so a row's width can be derived from the area it must hold.
  const scale = (width * height) / total;

  const out: TreemapRect[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let rest = usable.map((i) => ({ ...i, area: i.value * scale }));

  while (rest.length) {
    const short = Math.min(w, h);
    const row: typeof rest = [];
    let rowArea = 0;

    while (rest.length) {
      const candidate = rest[0];
      const next = worstRatio([...row, candidate].map((r) => r.area), rowArea + candidate.area, short);
      const current = row.length ? worstRatio(row.map((r) => r.area), rowArea, short) : Infinity;
      if (next > current) break;
      row.push(candidate);
      rowArea += candidate.area;
      rest = rest.slice(1);
    }

    // The row runs along the shorter edge; its thickness is whatever holds its area.
    const thickness = rowArea / short;
    let offset = 0;
    for (const item of row) {
      const length = item.area / thickness;
      out.push(
        w >= h
          ? { key: item.key, value: item.value, x, y: y + offset, width: thickness, height: length }
          : { key: item.key, value: item.value, x: x + offset, y, width: length, height: thickness },
      );
      offset += length;
    }

    if (w >= h) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    // Floating point can leave a sliver that would spawn an infinite loop of zero-width rows.
    if (w < 1e-9 || h < 1e-9) break;
  }

  return out;
}

/** The worst aspect ratio in a row, which is the thing the algorithm minimises. */
function worstRatio(areas: number[], total: number, short: number): number {
  if (!areas.length || total <= 0) return Infinity;
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  const side = total / short;
  return Math.max((side * side) / min, max / (side * side));
}
