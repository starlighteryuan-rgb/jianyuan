/**
 * Browser-safe outcomes from a Reflection submission.
 *
 * Kept outside the `use server` action module because Next.js requires every
 * runtime export from that module to be an async function.
 */
export const REFLECTION_SUBMIT_CODES = [
  /** The user's own words were ingested as a Record and are now readable. */
  'reflection-saved',
  /** A position was recorded. No Record was created (§21). */
  'position-recorded',
  /** The user deferred. A workflow action, not a verdict (§21). */
  'left-for-now',
  /** Nothing was stored, and why. Never reported as success. */
  'rejected',
  'target-missing',
  'not-stored',
  'unavailable',
] as const;

export type ReflectionSubmitCode =
  (typeof REFLECTION_SUBMIT_CODES)[number];
