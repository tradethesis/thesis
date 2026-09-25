"use client";

/**
 * The sound of opening a pack, synthesized.
 *
 * No audio files: nothing to download before the moment, nothing to license. Every sound is shaped
 * noise or a couple of sine partials through the Web Audio API:
 *
 *   crinkle  a grain of band-passed noise; fired while the seal is dragged, faster drag = more grains
 *   rip      a noise burst whose filter sweeps upward — the zipper of foil tearing — over a low thump
 *   pop      two soft partials and a puff, as the pack gives up its contents
 *   whoosh   a low-passed sweep per card flying out, scheduled on the audio clock, not on timers
 *
 * The context is created on the first sound, which always comes from a gesture (a drag or a press),
 * so browsers' autoplay rules are satisfied without an "enable audio" prompt. Sound is on by default
 * and the choice to mute is remembered on this device. Everything fails silent: a browser without
 * Web Audio, or with storage disabled, simply gets no sound.
 */

const KEY = "thesis:gift-sound";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? "off" : "on");
  } catch {
    /* Not remembered; still applies for this page. */
  }
  sessionMuted = muted;
}

let sessionMuted: boolean | null = null;

function audio(): AudioContext | null {
  if (sessionMuted ?? isMuted()) return null;
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

function noiseThrough(c: AudioContext, filter: BiquadFilterNode, gain: GainNode, at: number, dur: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(at, Math.random() * 0.5, dur);
}

/** One grain of foil. `intensity` 0..1 from drag speed. */
export function crinkle(intensity = 0.5): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2400 + Math.random() * 3600;
  f.Q.value = 1.6;
  const g = c.createGain();
  const peak = 0.05 + intensity * 0.09;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03);
  noiseThrough(c, f, g, t, 0.07);
}

export function rip(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  // The tear: a sweep up through the foil's bright band.
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(700, t);
  f.frequency.exponentialRampToValueAtTime(6200, t + 0.32);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
  g.gain.setValueAtTime(0.26, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  noiseThrough(c, f, g, t, 0.45);
  // The body of the pack, felt more than heard.
  const lo = c.createBiquadFilter();
  lo.type = "lowpass";
  lo.frequency.value = 260;
  const lg = c.createGain();
  lg.gain.setValueAtTime(0.0001, t);
  lg.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
  lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  noiseThrough(c, lo, lg, t, 0.18);
}

export function pop(delay = 0): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  for (const [freq, level] of [[523.25, 0.16], [783.99, 0.1], [1046.5, 0.05]] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.92, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.6);
  }
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  noiseThrough(c, f, g, t, 0.1);
}

/** `count` cards flying out, `gap` seconds apart, starting `delay` seconds from now. */
export function whooshes(count: number, gap = 0.09, delay = 0.12): void {
  const c = audio();
  if (!c) return;
  for (let i = 0; i < count; i++) {
    const t = c.currentTime + delay + i * gap;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    noiseThrough(c, f, g, t, 0.25);
  }
}

/** A short tick of haptics where the hardware has it (Android). Silently absent elsewhere. */
export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no haptics */
  }
}
