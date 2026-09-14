import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    // The engine is pure TypeScript with no React Native dependencies (ADR-0002),
    // so it runs in a plain Node environment at full speed.
    include: ["src/engine/**/*.test.ts", "src/drills/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
