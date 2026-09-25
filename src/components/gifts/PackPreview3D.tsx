"use client";

import { useEffect, useRef, useState } from "react";

import type { GiftPack as Pack } from "@/lib/gifts";
import { GiftPack } from "./GiftPack";
import type { SceneHandle } from "./pack-scene";

/**
 * The real pack, in 3D, sitting on the page: it floats and turns toward the pointer, and it cannot
 * be torn here (the seal is locked). Opening happens on the full-screen stage, which replaces this.
 *
 * The flat artwork shows until the scene is ready, and stays for anyone without WebGL or who asked
 * for reduced motion. One WebGL context at a time: unmount this before the stage mounts.
 */
export function PackPreview3D({ pack, image }: { pack: Pack; image?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gl = false;
    try {
      const c = document.createElement("canvas");
      gl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      gl = false;
    }
    if (reduced || !gl || !host.current) return;
    setFlat(false);
    let dead = false;
    let handle: SceneHandle | null = null;
    import("./pack-scene")
      .then(({ mountPackScene }) =>
        mountPackScene(host.current!, pack, { onReady: () => !dead && setReady(true), onPhase: () => {}, onOpened: () => {}, onDone: () => {} }, image),
      )
      .then((h) => {
        if (dead) return h.destroy();
        handle = h;
        h.setLocked(true);
      })
      .catch(() => !dead && setFlat(true));
    return () => {
      dead = true;
      handle?.destroy();
    };
    // Mounted once per pack; a new pack remounts the component (keyed by the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`gift-pack3d${ready ? " is-ready" : ""}${flat ? " is-flat" : ""}`}>
      <div className="gift-pack3d-scene" ref={host} aria-hidden="true" />
      {(!ready || flat) && (
        <div className="gift-pack3d-flat">
          <GiftPack pack={pack} image={image} />
        </div>
      )}
      <span className="gift-pack3d-floor" aria-hidden="true" />
    </div>
  );
}
