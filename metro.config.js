// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * The Better Auth cross-domain client plugin imports `better-auth/cookies` for one parsing
 * helper, and that entry point is the server's cookie module: JWT crypto, the database schema,
 * zod. Metro does not tree-shake, so the app would ship roughly 650 KB of server code. The
 * helper lives, import-free, in `cookie-utils.mjs` beside it; the app resolves to that file.
 * The Convex functions are bundled separately (esbuild) and keep the real module.
 */
const COOKIE_UTILS = path.join(
  path.dirname(require.resolve("better-auth/cookies")),
  "cookie-utils.mjs",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "better-auth/cookies") return { type: "sourceFile", filePath: COOKIE_UTILS };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
