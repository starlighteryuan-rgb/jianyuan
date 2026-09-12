/**
 * Reflection panel (ENGINEERING_CONTRACT §15, §21, §22, §23, §33, §36).
 *
 * A Server Component. The most contract-sensitive of the three surfaces, because
 * this is where the user answers back — and the shape of the form decides what
 * their answer can become.
 *
 * FOUR CONSTRAINTS THAT LIVE IN THIS MARKUP:
 *
 *   1. TWO SEPARATE FORMS. The position buttons post to `submitPosition`; the
 *      prose box posts to `submitReflection`. §21 treats a click and free text as
 *      different acts, so they do not share an endpoint and a click has no field
 *      it could travel in as prose (§15 — agreement is not evidence).
 *
 *   2. POSITIONS COME FROM THE DOMAIN. The buttons are rendered by mapping over
 *      the domain's own response constant rather than hardcoded labels, so the
 *      UI cannot offer a position the routing logic does not recognise.
 *
 *   3. HYPOTHESES ARE PREFERENCE-GATED AND CAPPED. §33's `hypothesisVisibility`
 *      decides whether they appear at all; the domain's cap decides how many.
 *
 *   4. NO SCORES, NO RANKING. As on the stream: support is categorical, and
 *      nothing is ordered by it (§36, INV-09).
 */

import {
  submitLeaveForNow,
  submitPosition,
  submitProse,
} from '../../actions/reflection';
import { REFLECTION_RESPONSES } from '@/domain/shared/enums';
import { relationClaimId } from '@/domain/shared/ids';
import { getServices } from '@/server/container';

const label = (value: string): string => value.replace(/_/g, ' ');

export default async function ReflectionPanelPage({
  params,
}: {
  readonly params: Promise<{ readonly targetRef: string }>;
}) {
  const { targetRef: raw } = await params;
  const targetRef = decodeURIComponent(raw);

  let services: ReturnType<typeof getServices>;

  try {
    services = getServices();
  } catch {
    return (
      <main>
        <h1>Respond</h1>
        <div className="notice">
          <p>
            <strong>Storage unavailable.</strong> Nothing can be read or
            recorded without a database connection.
          </p>
        </div>
      </main>
    );
  }

  const claim = await services.repositories.claims.findById(
    relationClaimId(targetRef),
  );
  const preference = await services.reflection.preference(new Date());

  if (claim === null) {
    return (
      <main>
        <h1>Respond</h1>
        <div className="notice">
          <p>
            <strong>Not found.</strong> Nothing is stored under{' '}
            <code>{targetRef}</code>.
          </p>
          <p className="faint">
            <a href="/">Back to the stream</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Respond</h1>
      <p className="lede">
        Your answer is yours. Agreeing with something here does not make it
        better supported — a position and evidence are separate things.
      </p>

      <article className="card">
        <div className="card-head">
          <strong>{claim.comparisonAxis.question}</strong>
          <span
            className={
              claim.supportLevel === null
                ? 'tag tag-unscored'
                : 'tag tag-level'
            }
          >
            {claim.supportLevel === null
              ? 'unscored'
              : label(claim.supportLevel)}
          </span>
        </div>
        <p className="card-body">{claim.evidenceSummary}</p>
        {claim.supportLevel === null ? (
          <p className="hint">
            This has not been assessed. That is not the same as weak support.
          </p>
        ) : null}
      </article>

      {/*
        FORM ONE — a position. Creates no Record; adjusts state only (§21).
        One button per domain-recognised response, so the UI cannot invent one.
      */}
      <h2>Does this match your experience?</h2>
      <form action={submitPosition}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <div className="button-row">
          {REFLECTION_RESPONSES.map((response) => (
            <button key={response} name="response" value={response} type="submit">
              {label(response)}
            </button>
          ))}
        </div>
        <p className="hint">
          Clicking records where you stand. It does not add evidence.
        </p>
      </form>

      {/*
        A third form, and a separate action again. §21 requires that stepping
        away not read as a verdict, so deferral carries no `response` at all
        rather than a "neutral" one — there is no such position.
      */}
      <form action={submitLeaveForNow}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <div className="button-row">
          <button type="submit">Leave this for now</button>
        </div>
        <p className="hint">
          Not a judgment either way. Nothing is concluded from walking away.
        </p>
      </form>

      {/*
        FORM TWO — the user's own words. A separate endpoint entirely, so a click
        can never arrive as prose (§15, §21).
      */}
      <h2>Anything you want to say about it?</h2>
      <form action={submitProse}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <label htmlFor="freeText">
          <span className="faint">
            Kept in your words, exactly as written.
          </span>
          <textarea
            id="freeText"
            name="freeText"
            placeholder="Optional."
          />
        </label>
        <div className="button-row">
          <button className="primary" type="submit">
            Save what I wrote
          </button>
        </div>
      </form>

      <div className="card-foot">
        <span className="faint">
          explanations: {label(preference.hypothesisVisibility)}
        </span>
        <a href="/">Back to the stream</a>
      </div>
    </main>
  );
}
