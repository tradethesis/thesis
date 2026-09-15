import type { NextConfig } from "next";

/**
 * NEXT_DIST_DIR lets a production build run without touching the .next a dev server is
 * holding open. Both write to .next by default, and a build underneath a live dev server
 * leaves it loading chunks that no longer exist.
 *
 *   NEXT_DIST_DIR=.next-build pnpm build
 */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
