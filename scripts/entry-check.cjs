/**
 * The entry screen behaves.
 *
 * The scene is a generated photograph (public/entry/hall.webp, see scripts/gen-entry-art.py).
 * What can go wrong with it is different from what went wrong with the SVG it replaced, so this
 * checks six things, every one of which has actually broken here:
 *
 *   1. Both widths load. A phone is served a pre-cropped file; a 404 on either is a black page.
 *   2. The art never swamps the text. This is the failure that made the whole scene worthless
 *      before: it is measured as real contrast against the pixels actually behind each line,
 *      sampled with the panel hidden, not judged from a screenshot.
 *   3. The asset is the one that was reviewed. The hard rule for this surface is no text and no
 *      numerals anywhere in the picture — a fake price on the front door of a product selling real
 *      exposure. That cannot be asserted automatically, so it is pinned by digest instead: swap the
 *      file and this fails until somebody has looked at the new one and updated the hash.
 *   4. Reduced motion stops the drift.
 *   5. Motion is transform only, read off the keyframes rather than off the source.
 *   6. A hidden tab pauses it, and the scene never intercepts the button.
 *
 *   BASE=http://localhost:3000 node scripts/entry-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3000/";
const ROOT = path.dirname(__dirname);

/* sha256 of the reviewed art. Regenerating is fine — look at the new frame, confirm it carries no
   text or numerals anywhere, then paste the new digest here. */
const APPROVED = {
  "public/entry/hall.webp": "5b4ba6fe",
  "public/entry/hall-narrow.webp": "a2f31837",
};

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

(async () => {
  let fail = 0;
  const ok = (l, c, d = "") => { if (!c) fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? "  " + d : ""}`); };

  for (const [rel, want] of Object.entries(APPROVED)) {
    const p = path.join(ROOT, rel);
    const got = fs.existsSync(p)
      ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 8)
      : "missing";
    ok(`${rel} is the reviewed art`, got === want, got);
  }

  const b = await chromium.launch();

  // 1. Both widths are served, at both breakpoints.
  for (const [w, h, expect] of [[1440, 900, "hall.webp"], [390, 844, "hall-narrow.webp"]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    const bad = [];
    p.on("response", (r) => { if (r.url().includes("/entry/") && r.status() >= 400) bad.push(`${r.url()} ${r.status()}`); });
    await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.locator(".ent-art").waitFor({ timeout: 60000 });
    // Attached is not decoded. On localhost the image is ready in the same tick; over a network it
    // is not, and `currentSrc` reads back empty — which looked like the phone being served nothing.
    await p.waitForFunction(() => {
      const i = document.querySelector(".ent-art");
      return i && i.complete && i.naturalWidth > 0;
    }, null, { timeout: 60000 });
    const chosen = await p.evaluate(() => {
      const i = document.querySelector(".ent-art");
      return { src: i.currentSrc.split("/").pop(), w: i.naturalWidth };
    });
    ok(`${w}px is served ${expect}`, chosen.src === expect && chosen.w > 0 && bad.length === 0,
      `${chosen.src} ${chosen.w}px ${bad.join(",")}`);
    await c.close();
  }

  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const p = await c.newPage();
  await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.locator(".ent-cta").waitFor({ timeout: 60000 });

  // 2. Contrast against the pixels actually behind each line. The panel is hidden for the sample,
  //    so what is measured is the art plus the scrim — exactly what the text has to survive.
  const boxes = await p.evaluate(() => {
    const pick = (sel) => {
      const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               colour: getComputedStyle(e).color };
    };
    return [pick(".ent-line"), pick(".ent-alt"), pick(".ent-note"), pick(".ent-foot a")].filter(Boolean);
  });
  const rgb = (css) => p.evaluate((c) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const cx = cv.getContext("2d"); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, css);
  await p.evaluate(() => { document.querySelector(".ent-panel").style.visibility = "hidden";
                           document.querySelector(".ent-foot").style.visibility = "hidden"; });
  await p.waitForTimeout(200);
  for (const box of boxes) {
    const shot = await p.screenshot({ clip: { x: box.x, y: box.y, width: Math.max(1, box.w), height: Math.max(1, box.h) } });
    const png = await (async () => {
      const im = await b.newPage();
      await im.setContent(`<img src="data:image/png;base64,${shot.toString("base64")}">`);
      const v = await im.evaluate(() => new Promise((res) => {
        const i = document.querySelector("img");
        const go = () => {
          const cv = document.createElement("canvas"); cv.width = i.naturalWidth; cv.height = i.naturalHeight;
          const cx = cv.getContext("2d"); cx.drawImage(i, 0, 0);
          const d = cx.getImageData(0, 0, cv.width, cv.height).data;
          let r = 0, g = 0, bl = 0, n = 0;
          for (let k = 0; k < d.length; k += 4) { r += d[k]; g += d[k+1]; bl += d[k+2]; n++; }
          res([r/n, g/n, bl/n]);
        };
        if (i.complete) { go(); } else { i.onload = go; }
      }));
      await im.close(); return v;
    })();
    const r = ratio(lum(await rgb(box.colour)), lum(png));
    const need = box.sel === ".ent-line" ? 4.5 : 4.5;
    ok(`${box.sel} reads over the art`, r >= need, `${r.toFixed(1)}:1`);
  }
  await p.evaluate(() => { document.querySelector(".ent-panel").style.visibility = "";
                           document.querySelector(".ent-foot").style.visibility = ""; });

  // 5. Motion is transform only.
  const props = await p.evaluate(() => {
    const bad = [];
    for (const s of document.styleSheets) {
      let rules; try { rules = s.cssRules; } catch { continue; }
      for (const r of rules) {
        if (r.type !== CSSRule.KEYFRAMES_RULE || !r.name.startsWith("ent-")) continue;
        for (const k of r.cssRules) for (const pr of k.style) if (pr !== "transform" && pr !== "opacity") bad.push(`${r.name}:${pr}`);
      }
    }
    return bad;
  });
  ok("motion is transform and opacity only", props.length === 0, props.join(","));

  // 6. Pause, and never intercept the button.
  await p.evaluate(() => document.querySelector(".ent").classList.add("ent-still"));
  ok("a hidden tab pauses the room",
    await p.evaluate(() => getComputedStyle(document.querySelector(".ent-art")).animationPlayState === "paused"));
  ok("the scene never intercepts the button", await p.evaluate(() => {
    const r = document.querySelector(".ent-cta").getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el && el.closest(".ent-cta") !== null;
  }));

  // 4. Reduced motion.
  const rm = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p2.locator(".ent-art").waitFor({ timeout: 60000 });
  ok("reduced motion stops the drift",
    await p2.evaluate(() => getComputedStyle(document.querySelector(".ent-art")).animationName === "none"));

  await b.close();
  console.log(fail ? `\n${fail} failing` : "\nthe entry screen behaves");
  process.exit(fail ? 1 : 0);
})();
