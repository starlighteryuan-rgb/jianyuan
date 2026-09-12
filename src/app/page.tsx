/**
 * Awareness Stream (ENGINEERING_CONTRACT §16, §18, §36, §42; arch §11 Patch 9).
 *
 * A Server Component. Reads, renders, decides nothing.
 *
 * FOUR CONSTRAINTS THAT LIVE IN THE MARKUP, not just the domain:
 *
 *   1. NO NUMERIC SCORE. Evidence support is rendered as its categorical level
 *      and never as a number, a bar, or a percentage (§36, INV-09). A number
 *      invites arithmetic the contract forbids.
 *
 *   2. NO RANKING BY SUPPORT. The list is ordered by arrival — `listAll` sorts
 *      on `createdAt` — never by support level (§36). Recency is not importance.
 *
 *   3. AN UNSCORED CLAIM IS MARKED, NOT DIMMED. Patch 9: `unscored`,
 *      `unavailable`, and `needs_retry` are explicit states, distinct from weak.
 *      They are rendered with a visible label rather than faded or hidden.
 *
 *   4. NOTHING IS PUSHED. L3 proactive presentation is off
 *      (`L3_ENABLED_BY_DEFAULT = false`); this page renders only what the user
 *      came to look at.
 */

import { createMemoryServices, getServices } from '@/server/container';

/**
 * NEVER PRERENDER THIS PAGE.
 *
 * Every word on it is per-request database state. Next.js prerenders a Server
 * Component with no dynamic inputs at BUILD time, which bakes one snapshot into
 * static HTML — and a build machine has no database, so what gets frozen in is
 * the "Storage unavailable" notice below. It would then be served forever, even
 * against a healthy database.
 *
 * That is precisely the failure §42 exists to prevent: the page would explain a
 * state that is not the current one, and explain it convincingly. A stale
 * "nothing has been noticed yet" is worse than an error, because it reads as a
 * fact about the user's life.
 */
export const dynamic = 'force-dynamic';

const STREAM_LIMIT = 50;

/** Categorical, never numeric (§36, INV-09). */
const supportLabel = (level: string | null): string =>
  level === null ? 'unscored' : level.replace(/_/g, ' ');

export default async function AwarenessStreamPage() {
  // A missing database is an explicit unavailable state, not a crash and not an
  // empty stream — §42 requires a state explain itself, and "nothing here" and
  // "cannot reach storage" are different facts.
  let services: ReturnType<typeof createMemoryServices>;

  try {
    services = getServices();
  } catch {
    return (
      <main>
        <h1>Awareness</h1>
        <div className="notice">
          <p>
            <strong>Storage unavailable.</strong> No database connection is
            configured, so nothing can be read.
          </p>
          <p className="faint">
            Set <code>DATABASE_URL</code> and run{' '}
            <code>npx prisma migrate deploy</code>. This is not an empty stream —
            it is an unread one.
          </p>
        </div>
      </main>
    );
  }

  const claims = await services.repositories.claims.listAll(STREAM_LIMIT);
  const hypotheses = await services.repositories.hypotheses.listAll();

  const isEmpty = claims.length === 0 && hypotheses.length === 0;

  return (
    <main>
      <h1>Awareness</h1>
      <p className="lede">
        What has been recorded, and what has been noticed about it. Ordered by
        when it arrived — not by how strong it is.
      </p>

      {isEmpty ? (
        <div className="notice">
          <p>
            <strong>Nothing has been noticed yet.</strong>
          </p>
          <p className="faint">
            Relations appear here once records exist and analysis has run. An
            empty stream is shown as empty rather than filled with placeholders.
          </p>
        </div>
      ) : null}

      {claims.length > 0 ? (
        <>
          <h2>Relations</h2>
          {claims.map((claim) => (
            <article className="card" key={claim.id}>
              <div className="card-head">
                <strong>{claim.comparisonAxis.question}</strong>
                <span
                  className={
                    claim.supportLevel === null
                      ? 'tag tag-unscored'
                      : 'tag tag-level'
                  }
                >
                  {supportLabel(claim.supportLevel)}
                </span>
              </div>

              <p className="card-body">{claim.evidenceSummary}</p>

              {claim.supportLevel === null ? (
                <p className="hint">
                  This relation has not been assessed. That is a different
                  statement from weak support.
                </p>
              ) : null}

              <div className="card-foot">
                <span className="faint">
                  {claim.recordRefs.length} record
                  {claim.recordRefs.length === 1 ? '' : 's'}
                </span>
                <span className="faint">{claim.relationType}</span>
                <a href={`/reflect/${encodeURIComponent(claim.id)}`}>
                  Respond to this
                </a>
              </div>
            </article>
          ))}
        </>
      ) : null}

      {hypotheses.length > 0 ? (
        <>
          <h2>Possible explanations</h2>
          <p className="faint">
            These are competing explanations, held as peers. None carries a
            probability, and they are not ordered by strength.
          </p>
          {hypotheses.map((hypothesis) => (
            <article className="card" key={hypothesis.id}>
              <div className="card-head">
                <span className="faint">{hypothesis.id}</span>
              </div>
              <div className="card-foot">
                <a href={`/reflect/${encodeURIComponent(hypothesis.id)}`}>
                  Respond to this
                </a>
              </div>
            </article>
          ))}
        </>
      ) : null}
    </main>
  );
}
