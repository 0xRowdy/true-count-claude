import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const source = v.union(
  v.literal("stripe"),
  v.literal("app_store"),
  v.literal("play_store"),
  v.literal("promotional"),
);

/** The fields of `Entitlement` (convex/lib/plan.ts), as stored. */
export const entitlementFields = {
  source,
  /** The store's id for the purchase: a Stripe subscription or payment intent, a store product. */
  externalId: v.string(),
  plan: v.union(v.literal("plus"), v.literal("lifetime")),
  status: v.union(
    v.literal("trialing"),
    v.literal("active"),
    v.literal("past_due"),
    v.literal("ended"),
  ),
  /** Epoch ms; null for Lifetime. */
  expiresAt: v.union(v.number(), v.null()),
  willRenew: v.boolean(),
  interval: v.union(v.literal("month"), v.literal("year"), v.null()),
};

/** `ResolvedPlan` (convex/lib/plan.ts), as returned to clients. */
export const resolvedPlan = v.object({
  plan: v.union(v.literal("free"), v.literal("plus"), v.literal("lifetime")),
  source: v.union(source, v.null()),
  status: v.union(entitlementFields.status, v.null()),
  expiresAt: v.union(v.number(), v.null()),
  willRenew: v.boolean(),
  interval: entitlementFields.interval,
  alsoRenewing: v.array(source),
});

/**
 * Users, sessions and sign-in accounts live in the Better Auth component's own tables; Stripe
 * customers and checkout sessions in the Stripe component's. This schema holds only what the
 * app itself decides on.
 */
export default defineSchema({
  /**
   * What each store says an Account has bought, one row per purchase, kept current by the
   * store's webhooks. `resolvePlan` turns an Account's rows into its Plan (ADR-0007).
   */
  entitlements: defineTable({
    /** The Better Auth user id (`identity.subject`), also RevenueCat's app user id. */
    userId: v.string(),
    ...entitlementFields,
  })
    .index("by_user", ["userId"])
    .index("by_external", ["source", "externalId"]),
});
