import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Lint configuration for True Count.
 *
 * Most of this file exists for one reason: to turn the promises in ADR-0002 and ADR-0004
 * into build failures rather than good intentions.
 *
 *   ADR-0002 — `src/engine` is pure TypeScript. No React, no React Native, no Expo, no
 *              storage, no network, and nothing from `src/ui` or `src/state`.
 *   ADR-0004 — the shoe is seeded and reproducible. Randomness enters the engine only
 *              through the injected `Rng` (src/engine/rng.ts), and the engine reads no
 *              clock. A stray `Math.random()` would silently make the Shoe Integrity
 *              Panel a lie and the engine's test suite meaningless.
 *
 * Both invariants are user-facing promises (product invariants 4 and 5), so a violation
 * is a failed build, not a warning.
 */

/** Node built-ins, in both bare and `node:`-prefixed form. The engine performs no I/O. */
const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "dns",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "stream",
  "timers",
  "timers/promises",
  "tls",
  "url",
  "worker_threads",
  "zlib",
];

const ENGINE_FORBIDDEN_IMPORT_PATTERNS = [
  {
    group: [
      "react",
      "react/*",
      "react-dom",
      "react-dom/*",
      "react-native",
      "react-native/**",
      "react-native-*",
      "react-native-*/**",
      "@react-native/**",
      "@react-navigation/**",
      "expo",
      "expo/**",
      "expo-*",
      "expo-*/**",
      "@expo/**",
    ],
    message:
      "ADR-0002: src/engine is pure TypeScript. It may not import React, React Native or Expo. Keep framework code in src/ui.",
  },
  {
    group: [
      "@react-native-async-storage/**",
      "@react-native-community/**",
      "expo-secure-store",
      "expo-file-system",
      "expo-sqlite",
      "axios",
      "node-fetch",
      "undici",
      "ky",
      "superagent",
      "node:*",
      "node:*/**",
      ...NODE_BUILTINS,
    ],
    message:
      "ADR-0002: src/engine performs no I/O. No storage, no network, no Node built-ins. Persistence belongs in src/state.",
  },
  {
    group: [
      "@/ui",
      "@/ui/**",
      "@/state",
      "@/state/**",
      "@/drills",
      "@/drills/**",
      "@/app",
      "@/app/**",
      "**/ui",
      "**/ui/**",
      "**/state",
      "**/state/**",
      "**/drills",
      "**/drills/**",
      "**/app",
      "**/app/**",
    ],
    message:
      "ADR-0002: src/engine sits at the bottom of the stack. It may not import from src/ui, src/state, src/drills or app — those import the engine, never the reverse.",
  },
];

/**
 * ADR-0004. `Math.imul` is fine and used by the mulberry32 PRNG; only `Math.random` is
 * banned. The MemberExpression selectors also catch a bare reference being passed around
 * (e.g. `shuffle(deck, Math.random)`), not just a direct call.
 */
const ENGINE_FORBIDDEN_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message:
      "ADR-0004: Math.random() is banned in src/engine. The shoe must be reproducible from its seed — take randomness from the injected Rng (src/engine/rng.ts).",
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      "ADR-0004: src/engine reads no clock. Date.now() makes the engine non-deterministic — pass the timestamp in from the caller.",
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message:
      "ADR-0004: src/engine reads no clock. Construct Dates in src/state or src/ui and pass the value in.",
  },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message:
      "ADR-0004: src/engine reads no clock. performance.now() makes the engine non-deterministic.",
  },
  {
    selector: "CallExpression[callee.name='setTimeout'], CallExpression[callee.name='setInterval']",
    message: "ADR-0002: src/engine is synchronous. Timers belong in src/ui or src/state.",
  },
];

/** Ambient host APIs. Reaching for any of these means the engine stopped being pure. */
const ENGINE_FORBIDDEN_GLOBALS = [
  { name: "fetch", message: "ADR-0002: src/engine performs no network I/O." },
  { name: "XMLHttpRequest", message: "ADR-0002: src/engine performs no network I/O." },
  { name: "WebSocket", message: "ADR-0002: src/engine performs no network I/O." },
  { name: "localStorage", message: "ADR-0002: src/engine performs no storage I/O." },
  { name: "sessionStorage", message: "ADR-0002: src/engine performs no storage I/O." },
  { name: "indexedDB", message: "ADR-0002: src/engine performs no storage I/O." },
  { name: "window", message: "ADR-0002: src/engine is platform-agnostic — no DOM access." },
  { name: "document", message: "ADR-0002: src/engine is platform-agnostic — no DOM access." },
  { name: "navigator", message: "ADR-0002: src/engine is platform-agnostic — no host APIs." },
  { name: "performance", message: "ADR-0004: src/engine reads no clock." },
];

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "web-build/**",
      ".expo/**",
      "expo-env.d.ts",
      "assets/**",

      // Parallel agents run in git worktrees here. Their trees are separate
      // checkouts, and linting them fails CI on code that is not ours.
      ".claude/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2024 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // The engine boundary. This block is the enforcement of ADR-0002 and ADR-0004.
  // ---------------------------------------------------------------------------
  {
    files: ["src/engine/**/*.ts"],
    languageOptions: {
      // The engine targets no host. It gets the language and nothing else — which is
      // why an undeclared `window` or `fetch` is a no-undef error here.
      globals: { ...globals.es2024 },
    },
    rules: {
      "no-restricted-imports": ["error", { patterns: ENGINE_FORBIDDEN_IMPORT_PATTERNS }],
      "no-restricted-syntax": ["error", ...ENGINE_FORBIDDEN_SYNTAX],
      "no-restricted-globals": ["error", ...ENGINE_FORBIDDEN_GLOBALS],
    },
  },

  // Config files at the repo root run in Node.
  {
    files: ["*.config.{js,mjs,ts}", "*.config.*.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
