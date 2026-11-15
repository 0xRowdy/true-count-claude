import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

/** Convex trusts the JWTs Better Auth mints (served from this deployment's JWKS). */
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
