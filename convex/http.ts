import { registerRoutes as registerStripeRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { stripeEvents, syncRevenueCat } from "./billing";
import { rcEventUserIds } from "./lib/stores";

const http = httpRouter();

// Better Auth at /api/auth/*. CORS on: the web app is a static site on another origin.
authComponent.registerRoutes(http, createAuth, { cors: true });

// Stripe: the component verifies the signature and syncs its own tables, then our handlers
// update Entitlements.
registerStripeRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: stripeEvents,
});

/**
 * RevenueCat (App Store and Google Play). It sends the Authorization value configured in its
 * dashboard; anything else is refused. The payload only says *who* changed, so each user's
 * current state is re-read from RevenueCat, which makes retries and reordering harmless. A
 * failure answers 500 so RevenueCat retries (five times over about 80 minutes).
 */
http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected) return new Response("RevenueCat webhook is not configured", { status: 500 });
    if (request.headers.get("Authorization") !== expected) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = (await request.json()) as { event?: Parameters<typeof rcEventUserIds>[0] };
    for (const userId of rcEventUserIds(body.event ?? {})) {
      // Dashboard test events and deleted Accounts name no user of ours.
      if (!(await authComponent.getAnyUserById(ctx, userId))) continue;
      await syncRevenueCat(ctx, userId);
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
