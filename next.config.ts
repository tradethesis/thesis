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

  /**
   * Privy's bundle references integrations this product does not use.
   *
   * `@farcaster/mini-app-solana` is loaded only when the app is running inside a Farcaster
   * mini-app host, which Thesis never is. It is not a declared dependency, so webpack
   * cannot resolve it and fails the build over a code path that can never execute.
   * Resolving it to false removes the branch rather than installing a package to satisfy
   * an import nothing calls.
   */
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
};

export default nextConfig;
