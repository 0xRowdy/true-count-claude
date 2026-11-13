import actionRetrier from "@convex-dev/action-retrier/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";
import { defineApp } from "convex/server";

/**
 * Components (ADR-0007): Better Auth owns users, sessions and linked sign-in providers;
 * the Stripe component owns customers, checkout sessions and webhook signature checks; the
 * action retrier runs what deletion leaves to do (`cleanup.ts`).
 */
const app = defineApp();
app.use(betterAuth);
app.use(stripe);
app.use(actionRetrier);

export default app;
