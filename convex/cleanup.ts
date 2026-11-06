import { ActionRetrier, onCompleteValidator, type RunId } from "@convex-dev/action-retrier";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Work left over after an Account is deleted (canceling its Stripe subscriptions, revoking its
 * Apple sign-in). Nobody is left to notice a failure, so each runs under the action retrier,
 * which also retries an action that crashed or timed out rather than threw: 6 tries over about
 * 13 hours (1, 5, 25, 125 and 625 minutes apart). If the last one fails, the log says what to
 * do by hand.
 */
const retrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 60_000,
  base: 5,
  maxFailures: 5,
});

/** `byHand`: what someone must do if every try fails, naming the Account and its ids. */
export async function runCleanup<F extends FunctionReference<"action", "internal">>(
  ctx: MutationCtx,
  action: F,
  args: FunctionArgs<F>,
  byHand: string,
): Promise<void> {
  const runId = await retrier.run(ctx, action, args, { onComplete: internal.cleanup.finished });
  await ctx.db.insert("cleanups", { runId, byHand });
}

export const finished = internalMutation({
  args: onCompleteValidator,
  returns: v.null(),
  handler: async (ctx, { runId, result }) => {
    const row = await ctx.db
      .query("cleanups")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .unique();
    if (result.type === "failed") {
      console.error(
        `GAVE UP after every retry: ${row?.byHand ?? runId}. Last error:`,
        result.error,
      );
    }
    if (row) await ctx.db.delete(row._id);
    // The run's arguments can hold a token: drop them now rather than in 7 days. Not here: the
    // retrier marks the run complete after this returns.
    await ctx.scheduler.runAfter(0, internal.cleanup.forget, { runId });
    return null;
  },
});

export const forget = internalMutation({
  args: { runId: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    await retrier.cleanup(ctx, runId as RunId);
    return null;
  },
});
