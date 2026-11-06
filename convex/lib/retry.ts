/** Backoff for a call nobody is waiting on (canceling Stripe after an Account is deleted). */
const RETRY_MINUTES = [1, 5, 30, 120, 720];

/** How long to wait before retry `attempt` (0-based), or null to give up. */
export function retryDelay(attempt: number): number | null {
  const minutes = RETRY_MINUTES[attempt];
  return minutes === undefined ? null : minutes * 60_000;
}
