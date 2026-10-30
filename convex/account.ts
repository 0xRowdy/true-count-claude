import { v } from "convex/values";
import { query } from "./_generated/server";
import { authComponent } from "./auth";
import { resolvePlan } from "./lib/plan";
import { resolvedPlan } from "./schema";

/**
 * The signed-in Account and its Plan, or null when signed out. Reactive: a purchase on any
 * device, or a store's webhook, updates every open screen.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      image: v.union(v.string(), v.null()),
      plan: resolvedPlan,
    }),
  ),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    // Convex reruns a query when its rows change, not when time passes: expiry reaches the
    // client through the stores' webhooks (Stripe's subscription.deleted, RevenueCat's
    // EXPIRATION), which rewrite the rows.
    const plan = resolvePlan(rows, Date.now());
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      plan,
    };
  },
});
