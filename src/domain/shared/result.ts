/**
 * Minimal Result type for the domain core.
 *
 * Deterministic domain rules must be able to REFUSE to answer rather than
 * guess. This matters most where ENGINEERING_CONTRACT / architecture
 * deliberately leave a criterion unresolved: the code must fail closed
 * instead of inventing a default that would manufacture evidence
 * (INV-03, INV-16, ENGINEERING_CONTRACT §6.1).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Unwrap for tests and call sites that have already narrowed the branch. */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (!r.ok) {
    throw new Error(`unwrap called on Err: ${JSON.stringify(r.error)}`);
  }
  return r.value;
};
