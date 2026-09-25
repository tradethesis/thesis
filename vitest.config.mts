import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .tsx so a component's rendered states can be tested as markup (see claim-screens.test.tsx).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
  // Next compiles JSX itself and leaves tsconfig on "preserve"; tests need it transformed. This
  // toolchain is rolldown, whose transformer is oxc — an `esbuild` option here would be ignored.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    // The same "@/" the app and tsconfig use. Without it, any module whose import chain
    // touches "@/…" simply could not be tested — which is why nothing had ever imported
    // publish.ts from a test, and why its guards went unverified.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
