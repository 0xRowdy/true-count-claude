import { ConvexReactClient } from "convex/react";

/**
 * The Convex deployment this build talks to, inlined at build time from EXPO_PUBLIC_* (see
 * docs/accounts-and-billing.md). A build without one, CI's among them, has no Accounts at
 * all: every screen says so plainly and the trainer works exactly as before (invariant 8).
 */
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
export const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

export const ACCOUNTS_AVAILABLE = Boolean(CONVEX_URL && CONVEX_SITE_URL);

/**
 * Connects lazily: nothing goes over the wire until a query subscribes, and the account hooks
 * only subscribe after mount, so prerendering the web export never opens a socket.
 */
export const convex = ACCOUNTS_AVAILABLE
  ? new ConvexReactClient(CONVEX_URL!, { unsavedChangesWarning: false })
  : null;
