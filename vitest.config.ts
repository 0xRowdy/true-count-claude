import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    // The engine is pure TypeScript with no React Native dependencies (ADR-0002),
    // so it runs in a plain Node environment at full speed.
    //
    // `src/state` keeps its one platform dependency behind an injected store, and
    // `src/ui` contributes only the React-free arithmetic beneath a screen, so both
    // run here on the same terms. The Shoe Integrity Panel's zero-sum check is a
    // product promise (invariant 5), so it is asserted in CI rather than only
    // rendered — see `src/ui/shoe-integrity/integrity.test.ts`.
    //
    // A test that needs to render a component does not belong in this project.
    include: [
      "src/engine/**/*.test.ts",
      "src/drills/**/*.test.ts",
      "src/state/**/*.test.ts",
      "src/ui/**/*.test.ts",
    ],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
