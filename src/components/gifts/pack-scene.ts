import confetti from "canvas-confetti";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { buzz, crinkle, pop, rip } from "@/lib/gift-sound";
import type { GiftPack as Pack } from "@/lib/gifts";

/**
 * A foil pack in WebGL, torn open by hand.
 *
 * The pack is a real mesh, built here rather than downloaded: a model from a marketplace would bring
 * its own licence and its own artwork, and every pack needs ours. The shape is a pillow — a sheet
 * puffed in the middle, pinched flat at the side seams and crimped at the top and bottom seals — with
 * a front and a back, each split at the tear line into the body and the strip that comes off.
 *
 * What makes it read as foil rather than paper is the material and the light, not the geometry: a
 * metallic, clear-coated, iridescent surface reflecting a studio environment, with a normal map of
 * fine creases so the highlights break up as it turns.
 *
 *   sealed    idle float; tilts toward the pointer; the foil catches the light
 *   dragging  the strip peels from the pulled end, progressively along the tear line
 *   tearing   the strip comes free and flies off                      (~0.45 s)
 *   burst     the pack jolts, light spills from the opening, confetti (~0.5 s)
 *   torn      the empty pack drops away; the page shows the contents  (~0.7 s)
 *
 * Imperative on purpose: the render loop reads plain variables, so nothing here re-renders React.
 */

export type Phase = "sealed" | "dragging" | "tearing" | "burst" | "torn";

export type SceneEvents = {
  onReady(): void;
  onPhase(phase: Phase): void;
  /** The pack is open: show the contents underneath. */
  onOpened(): void;
  /** The pack has left the stage. */
  onDone(): void;
};

/** `setLocked(true)`: the seal ignores the finger (the gift is still being bought); `tear()` still works. */
export type SceneHandle = { tear(direction?: 1 | -1): void; setLocked(locked: boolean): void; destroy(): void };

// Pack dimensions, in scene units. Height : width is the pack artwork's.
const W = 2;
const H = 3.1;
const CRIMP = 0.13;
const TEAR_Y = H / 2 - 0.3;
const PUFF = 0.17;

const COLORS: Record<Pack["color"], { light: string; dark: string }> = {
  blue: { light: "#3a4ca3", dark: "#1d2563" },
  green: { light: "#3d765a", dark: "#1f4233" },
  red: { light: "#df6440", dark: "#98301a" },
  gold: { light: "#c59a45", dark: "#7c5a1c" },
};
const INK = "#f6f0e0";
const PACK_INK_HEX: Record<Pack["color"], string> = { blue: "#34469a", green: "#2f6b45", red: "#e04e24", gold: "#b8862e" };

/* ------------------------------------------------------------------------------------ geometry */

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** How far from flat the foil stands at (x, y): 0 at the seams, PUFF in the middle. */
function height(x: number, y: number): number {
  const u = (x + W / 2) / W;
  const sx = 1 - Math.pow(Math.abs(2 * u - 1), 6);
  const d = Math.min(H / 2 - y, y + H / 2);
  if (d < CRIMP) {
    // The crimped seal: flat, with fine vertical ridges.
    return 0.005 * Math.abs((((x * 55) % 2) + 2) % 2 - 1);
  }
  const sy = smooth((d - CRIMP) / 0.5);
  const s = sx * sy;
  // Foil never lies perfectly smooth; a little slack in the middle keeps the reflections alive.
  const slack = 0.012 * Math.sin(x * 6.3 + y * 2.9) * Math.sin(y * 4.7 - x * 1.9) + 0.004 * Math.sin(x * 21 + y * 15);
  return PUFF * s + slack * s;
}

/** One side of one part of the pack: the sheet between y0 and y1, facing +z (front) or -z (back). */
function sheet(y0: number, y1: number, back: boolean): THREE.BufferGeometry {
  const segY = Math.max(6, Math.round(((y1 - y0) / H) * 96));
  const g = new THREE.PlaneGeometry(W, y1 - y0, 56, segY);
  g.translate(0, (y0 + y1) / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = height(x, y);
    pos.setZ(i, back ? -z : z);
    // Back: mirrored so its artwork reads correctly from behind.
    uv.setXY(i, back ? 1 - (x + W / 2) / W : (x + W / 2) / W, (y + H / 2) / H);
  }
  if (back) {
    // Reverse the winding so the back's faces point away from the front.
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------------------ textures */

function fontFamily(): string {
  return getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
}

function motif(ctx: CanvasRenderingContext2D, kind: Pack["motif"], cx: number, cy: number, size: number) {
  const k = size / 240;
  ctx.save();
  ctx.translate(cx - 120 * k, cy - 120 * k);
  ctx.scale(k, k);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;
  const ellipse = (x: number, y: number, rx: number, ry: number, deg: number) => {
    ctx.save();
    ctx.translate(120, 120);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-120, -120);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  if (kind === "orbit") {
    ctx.beginPath();
    ctx.arc(120, 120, 70, 0, Math.PI * 2);
    ctx.stroke();
    ellipse(120, 120, 98, 36, -38);
    ellipse(120, 120, 98, 36, 38);
    ellipse(120, 120, 36, 98, 0);
    ctx.beginPath();
    ctx.arc(120, 120, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(176, 78, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "bloom") {
    for (let i = 0; i < 12; i++) ellipse(120, 86, 24, 58, i * 30);
    ctx.beginPath();
    ctx.arc(120, 120, 16, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "rings") {
    for (const r of [22, 44, 66, 88]) {
      ctx.beginPath();
      ctx.arc(120, 120, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(120, 120, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = 0; i < 16; i++) {
      ctx.save();
      ctx.translate(120, 120);
      ctx.rotate((i * 22.5 * Math.PI) / 180);
      ctx.translate(-120, -120);
      ctx.beginPath();
      ctx.moveTo(120, 30);
      ctx.lineTo(131, 99);
      ctx.lineTo(120, 120);
      ctx.lineTo(109, 99);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.arc(120, 120, 94, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The printed face of the pack, or its back. No amount and no holdings: that is the surprise. */
function packFace(pack: Pack, side: "front" | "back", photo?: HTMLImageElement | null): HTMLCanvasElement {
  const TW = 1024;
  const TH = Math.round((TW * H) / W);
  const c = document.createElement("canvas");
  c.width = TW;
  c.height = TH;
  const ctx = c.getContext("2d")!;
  const { light, dark } = COLORS[pack.color];
  const font = fontFamily();

  const bg = ctx.createLinearGradient(0, 0, TW, TH);
  bg.addColorStop(0, light);
  bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TW, TH);

  // Fine foil grain: diagonal hairlines, barely there, so the light has texture to catch.
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let i = -TH; i < TW; i += 7) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + TH, TH);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Crimped seals, top and bottom.
  const crimp = Math.round((CRIMP / H) * TH);
  for (const y0 of [0, TH - crimp]) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, y0, TW, crimp);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let x = 0; x < TW; x += 12) ctx.fillRect(x, y0, 5, crimp);
  }

  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  if (side === "front") {
    // The tear line: a notch at each edge, a dotted line, and the words.
    const ty = Math.round(((H / 2 - TEAR_Y) / H) * TH);
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, ty);
    ctx.lineTo(TW - 40, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `600 22px ${font}`;
    ctx.textAlign = "right";
    ctx.fillText("TEAR HERE  →", TW - 56, ty - 16);
    ctx.globalAlpha = 1;
    for (const x of [0, TW]) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x, ty - 14);
      ctx.lineTo(x === 0 ? 22 : TW - 22, ty);
      ctx.lineTo(x, ty + 14);
      ctx.fill();
    }
    ctx.fillStyle = INK;

    const pad = 78;
    ctx.textAlign = "left";
    ctx.font = `620 46px ${font}`;
    ctx.fillText("thesis", pad + 50, ty + 96);
    // The mark: a T.
    ctx.fillRect(pad, ty + 60, 38, 9);
    ctx.fillRect(pad + 14.5, ty + 60, 9, 40);
    ctx.textAlign = "right";
    ctx.font = `500 24px ${font}`;
    ctx.fillText(`NO. ${pack.edition}`, TW - pad, ty + 92);

    ctx.textAlign = "left";
    ctx.font = `560 118px ${font}`;
    const lines = wrapLines(ctx, pack.name, TW - pad * 2);
    lines.forEach((l, i) => ctx.fillText(l, pad, ty + 250 + i * 118));
    const after = ty + 250 + (lines.length - 1) * 118;
    ctx.globalAlpha = 0.85;
    ctx.font = `400 34px ${font}`;
    ctx.fillText(pack.subtitle, pad, after + 70);
    ctx.globalAlpha = 1;

    const cy = Math.min(TH - 380, after + 420);
    if (photo) drawPhoto(ctx, photo, TW / 2, cy, 560);
    else motif(ctx, pack.motif, TW / 2, cy, 520);

    ctx.globalAlpha = 0.6;
    ctx.fillRect(pad, TH - crimp - 110, TW - pad * 2, 2);
    ctx.globalAlpha = 1;
    ctx.font = `600 22px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("A FUTURE WORTH SHARING", pad, TH - crimp - 60);
    ctx.textAlign = "right";
    ctx.fillText("A GIFT · OPEN BY HAND", TW - pad, TH - crimp - 60);
  } else {
    ctx.textAlign = "center";
    ctx.fillRect(TW / 2 - 60, TH / 2 - 120, 120, 26);
    ctx.fillRect(TW / 2 - 13, TH / 2 - 120, 26, 130);
    ctx.font = `620 64px ${font}`;
    ctx.fillText("thesis", TW / 2, TH / 2 + 110);
    ctx.globalAlpha = 0.7;
    ctx.font = `400 26px ${font}`;
    ctx.fillText("Tokenized stocks track the share price and can lose value.", TW / 2, TH - crimp - 90);
    ctx.globalAlpha = 1;
  }
  return c;
}

/** The sender's photo in a rounded window, cover-cropped, edged in the pack's ink. */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const r = 34;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
  };
  ctx.save();
  path();
  ctx.clip();
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, size, size);
  const sheen = ctx.createLinearGradient(x, y, x + size, y + size);
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, size, size);
  ctx.restore();
  path();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** A photo, decoded before the texture is built; a photo that will not load is simply left out. */
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** A normal map of fine creases, the kind foil gets from being handled. */
function creaseNormals(): HTMLCanvasElement {
  const n = 512;
  const hc = document.createElement("canvas");
  hc.width = hc.height = n;
  const h = hc.getContext("2d")!;
  h.fillStyle = "rgb(128,128,128)";
  h.fillRect(0, 0, n, n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const g = Math.round(90 + rnd() * 80);
    h.strokeStyle = `rgba(${g},${g},${g},0.55)`;
    h.lineWidth = 1 + rnd() * 2.5;
    h.beginPath();
    const x = rnd() * n;
    const y = rnd() * n;
    const a = rnd() * Math.PI;
    const l = 40 + rnd() * 180;
    h.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
    h.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    h.stroke();
  }
  const src = h.getImageData(0, 0, n, n).data;
  const out = h.createImageData(n, n);
  const at = (x: number, y: number) => src[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * 2.2;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * n + x) * 4;
      out.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  h.putImageData(out, 0, 0);
  return hc;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(255,246,220,1)");
  r.addColorStop(0.35, "rgba(255,200,120,0.55)");
  r.addColorStop(1, "rgba(255,160,80,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------------------------------------------------------------------- scene */

export async function mountPackScene(host: HTMLElement, pack: Pack, ev: SceneEvents, imageUrl?: string | null): Promise<SceneHandle> {
  await document.fonts?.ready;
  const photo = imageUrl ? await loadImage(imageUrl) : null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 3, 5);
  const rim = new THREE.DirectionalLight(0xffe0c0, 0.9);
  rim.position.set(-3, -1, -3);
  const flash = new THREE.PointLight(0xffd8a0, 0, 7, 1.6);
  flash.position.set(0, TEAR_Y + 0.15, 0.9);
  scene.add(key, rim, flash, new THREE.AmbientLight(0xffffff, 0.25));

  // Materials. Front and back each get their own; the strip gets clones so it can fade alone.
  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const frontMap = texture(packFace(pack, "front", photo));
  const backMap = texture(packFace(pack, "back"));
  const normalMap = new THREE.CanvasTexture(creaseNormals());
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(2, 3);
  const foil = (map: THREE.Texture) =>
    new THREE.MeshPhysicalMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.5,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
      iridescence: 0.55,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 720],
      envMapIntensity: 0.85,
      transparent: true,
    });
  const bodyFront = foil(frontMap);
  const bodyBack = foil(backMap);
  const stripFront = bodyFront.clone();
  const stripBack = bodyBack.clone();

  const pack3d = new THREE.Group();
  const body = new THREE.Group();
  const strip = new THREE.Group();
  const bodyGeos = [sheet(-H / 2, TEAR_Y, false), sheet(-H / 2, TEAR_Y, true)];
  const stripGeos = [sheet(TEAR_Y, H / 2, false), sheet(TEAR_Y, H / 2, true)];
  body.add(new THREE.Mesh(bodyGeos[0], bodyFront), new THREE.Mesh(bodyGeos[1], bodyBack));
  strip.add(new THREE.Mesh(stripGeos[0], stripFront), new THREE.Mesh(stripGeos[1], stripBack));
  pack3d.add(body, strip);
  scene.add(pack3d);
  const stripRest = stripGeos.map((g) => Float32Array.from((g.attributes.position as THREE.BufferAttribute).array));

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glow.position.set(0, TEAR_Y + 0.05, 0.4);
  glow.scale.setScalar(0.01);
  pack3d.add(glow);

  /* ---- layout ---- */
  function fit() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The pack fills ~64% of the height, or ~72% of the width on a narrow screen, whichever is smaller.
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, Math.max(H / 0.64 / t, W / (0.72 * camera.aspect) / t));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();

  /* ---- state read by the loop ---- */
  let phase: Phase = "sealed";
  let p = 0; // tear progress 0..1
  let dir: 1 | -1 = 1;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let lastHover = -10;
  let phaseAt = 0;
  const stripVel = new THREE.Vector3();
  const stripSpin = new THREE.Vector3();
  let drag: { x0: number; t0: number; width: number; lastGrain: number } | null = null;
  const clock = new THREE.Clock();

  function setPhase(next: Phase) {
    phase = next;
    phaseAt = clock.elapsedTime;
    ev.onPhase(next);
  }

  /** Peel the strip: the part already torn, from the pulled end to `p`, lifts up and toward you. */
  function peel() {
    const end = dir > 0 ? W / 2 : -W / 2;
    stripGeos.forEach((g, gi) => {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const rest = stripRest[gi];
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        const z = rest[i * 3 + 2];
        const s = Math.abs(x - end) / W; // 0 at the pulled end
        if (p <= 0 || s >= p) {
          pos.setXYZ(i, x, y, z);
          continue;
        }
        const t = (p - s) / p; // 1 at the pulled end
        const a = t * t * 1.9 * Math.min(1, p * 1.6);
        const dy = y - TEAR_Y;
        pos.setXYZ(i, x + dir * t * 0.12 * p, TEAR_Y + dy * Math.cos(a) - z * Math.sin(a) + t * 0.06 * p, dy * Math.sin(a) + z * Math.cos(a) + t * 0.22 * p);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    });
  }

  function screenOf(v: THREE.Vector3) {
    const r = canvas.getBoundingClientRect();
    const s = v.clone().applyMatrix4(pack3d.matrixWorld).project(camera);
    return { x: r.left + ((s.x + 1) / 2) * r.width, y: r.top + ((1 - s.y) / 2) * r.height };
  }

  function tear(direction: 1 | -1 = 1) {
    if (phase !== "sealed" && phase !== "dragging") return;
    drag = null;
    dir = direction;
    setPhase("tearing");
    rip();
    buzz(14);
    stripVel.set(dir * 2.4, 3.4, 2.2);
    stripSpin.set(-2.5, dir * 1.5, dir * 3.2);
  }

  function burst() {
    setPhase("burst");
    pop();
    buzz([8, 40, 12]);
    const o = screenOf(new THREE.Vector3(0, TEAR_Y, 0));
    const small = window.innerWidth < 600;
    const colors = ["#fe6847", PACK_INK_HEX[pack.color], "#f7f1e3", "#f2c265", "#ffffff"];
    const base = { origin: { x: o.x / window.innerWidth, y: o.y / window.innerHeight }, colors, disableForReducedMotion: true, scalar: small ? 0.85 : 1.05, ticks: 240, zIndex: 90 };
    void confetti({ ...base, particleCount: small ? 70 : 110, spread: 75, startVelocity: small ? 42 : 52, angle: 90 });
    void confetti({ ...base, particleCount: small ? 26 : 40, spread: 55, startVelocity: 36, angle: 58, drift: 0.5 });
    void confetti({ ...base, particleCount: small ? 26 : 40, spread: 55, startVelocity: 36, angle: 122, drift: -0.5 });
  }

  /* ---- pointer ---- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitLocalY(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...body.children, ...strip.children], false)[0];
    return hit ? pack3d.worldToLocal(hit.point.clone()).y : null;
  }
  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    if (!drag) {
      if (e.pointerType === "mouse" && phase === "sealed") {
        tilt.ty = (((e.clientX - r.left) / r.width) - 0.5) * 0.7;
        tilt.tx = (((e.clientY - r.top) / r.height) - 0.5) * 0.45;
        lastHover = clock.elapsedTime;
      }
      return;
    }
    const dx = e.clientX - drag.x0;
    if (dx !== 0) dir = dx > 0 ? 1 : -1;
    p = Math.min(1, Math.abs(dx) / (drag.width * 0.8));
    if (p - drag.lastGrain > 0.04) {
      crinkle(Math.min(1, (Math.abs(dx) / Math.max(1, performance.now() - drag.t0)) * 1.5));
      drag.lastGrain = p;
    }
    if (p >= 1) tear(dir);
  }
  let locked = false;
  function onDown(e: PointerEvent) {
    if (phase !== "sealed" || locked) return;
    const y = hitLocalY(e);
    // The seal tears. The body only answers with a little wobble.
    if (y === null) return;
    // A mouse aims at the seal; a thumb swipes across whatever it lands on. On touch, a drag that
    // starts anywhere on the pack tears it, or on a phone it reads as a pack that ignores you.
    if (e.pointerType !== "touch" && y < TEAR_Y - 0.5) {
      tilt.tx -= 0.08;
      crinkle(0.2);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const a = screenOf(new THREE.Vector3(-W / 2, 0, 0));
    const b = screenOf(new THREE.Vector3(W / 2, 0, 0));
    drag = { x0: e.clientX, t0: performance.now(), width: Math.abs(b.x - a.x), lastGrain: 0 };
    setPhase("dragging");
    crinkle(0.35);
  }
  function onUp(e: PointerEvent) {
    if (!drag) return;
    const speed = Math.abs(e.clientX - drag.x0) / Math.max(1, performance.now() - drag.t0);
    const d: 1 | -1 = e.clientX - drag.x0 >= 0 ? 1 : -1;
    drag = null;
    if (p > 0.55 || speed > 0.6) tear(d);
    else setPhase("sealed"); // the loop springs p back to 0
  }
  // iOS WebKit can claim a touch drag as a page scroll or rubber-band and cancel the pointer
  // stream halfway, whatever touch-action says. Holding the touch here keeps the swipe ours.
  const holdTouch = (e: TouchEvent) => {
    if (!locked && (phase === "sealed" || phase === "dragging")) e.preventDefault();
  };
  canvas.addEventListener("touchstart", holdTouch, { passive: false });
  canvas.addEventListener("touchmove", holdTouch, { passive: false });
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  const onLeave = () => {
    tilt.tx = 0;
    tilt.ty = 0;
  };
  canvas.addEventListener("pointerleave", onLeave);

  /* ---- loop ---- */
  let openedSent = false;
  let doneSent = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;
    const since = t - phaseAt;

    // Idle: a slow float, so the pack reads as an object even without a pointer.
    if (phase === "sealed" && t - lastHover > 1.2) {
      tilt.ty = Math.sin(t * 0.7) * 0.28;
      tilt.tx = Math.sin(t * 0.9 + 1) * 0.1;
    }
    if (phase === "dragging") {
      tilt.tx = -0.18;
      tilt.ty = -dir * p * 0.25;
    }
    const k = 1 - Math.pow(0.001, dt);
    tilt.x += (tilt.tx - tilt.x) * k;
    tilt.y += (tilt.ty - tilt.y) * k;
    pack3d.rotation.set(tilt.x, tilt.y, -0.06);
    pack3d.position.y = phase === "sealed" ? Math.sin(t * 1.1) * 0.04 : pack3d.position.y;
    key.position.set(2 + tilt.y * 6, 3 - tilt.x * 6, 5);

    if (phase === "sealed" && p > 0) {
      p = Math.max(0, p - dt * 3.5);
      peel();
    } else if (phase === "dragging") {
      peel();
    } else if (phase === "tearing") {
      if (p < 1) {
        p = Math.min(1, p + dt * 7);
        peel();
      } else {
        stripVel.y -= dt * 3;
        strip.position.addScaledVector(stripVel, dt);
        strip.rotation.x += stripSpin.x * dt;
        strip.rotation.y += stripSpin.y * dt;
        strip.rotation.z += stripSpin.z * dt;
        const fade = Math.max(0, 1 - Math.max(0, since - 0.25) / 0.3);
        stripFront.opacity = stripBack.opacity = fade;
      }
      if (since > 0.45) burst();
    } else if (phase === "burst") {
      const q = Math.min(1, since / 0.5);
      // Squash, then stretch, then settle.
      const sq = Math.sin(q * Math.PI) * (q < 0.4 ? -0.05 : 0.04);
      body.scale.set(1 - sq, 1 + sq, 1 + Math.sin(q * Math.PI) * 0.15);
      flash.intensity = 30 * Math.sin(Math.min(1, since / 0.6) * Math.PI);
      (glow.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, since / 0.7) * Math.PI);
      glow.scale.setScalar(0.5 + since * 3.2);
      strip.visible = false;
      if (since > 0.5) setPhase("torn");
    } else if (phase === "torn") {
      if (!openedSent) {
        openedSent = true;
        ev.onOpened();
      }
      const q = Math.min(1, since / 0.7);
      const e2 = q * q;
      body.position.set(0, -e2 * 1.6, -e2 * 2.5);
      body.rotation.x = e2 * 0.5;
      bodyFront.opacity = bodyBack.opacity = 1 - q;
      (glow.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.6 - q);
      flash.intensity = 0;
      if (q >= 1 && !doneSent) {
        doneSent = true;
        ev.onDone();
      }
    }
    renderer.render(scene, camera);
  });

  ev.onReady();

  return {
    tear,
    setLocked(next: boolean) {
      locked = next;
    },
    destroy() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener("touchstart", holdTouch);
      canvas.removeEventListener("touchmove", holdTouch);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      [...bodyGeos, ...stripGeos].forEach((g) => g.dispose());
      [bodyFront, bodyBack, stripFront, stripBack, glow.material].forEach((m) => m.dispose());
      [frontMap, backMap, normalMap, (glow.material as THREE.SpriteMaterial).map].forEach((m) => m?.dispose());
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      // dispose() frees three.js's resources but not the WebGL context itself. Browsers cap live
      // contexts, and every replay made a new one, so release it explicitly.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
