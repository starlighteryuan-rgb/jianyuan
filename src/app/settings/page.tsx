/**
 * Directives / Settings (ENGINEERING_CONTRACT §26, §33, INV-17).
 *
 * A Server Component with two forms.
 *
 * THE CONSTRAINT THAT SHAPES THIS PAGE: the four directive permissions are four
 * INDEPENDENT checkboxes (§26, INV-17). They are deliberately not a preset
 * dropdown, not a privacy "level", and not nested — because "只记录，不分析" (store
 * but do not analyse) must be expressible, and any grouping that made analysis
 * imply storage would quietly delete that option.
 *
 * Preference is overwritten in place with no history (§33).
 */

import { createDirective, revokeDirective } from '../actions/directives';
import { updatePreference } from '../actions/preferences';
import { getServices } from '@/server/container';

/**
 * NEVER PRERENDER THIS PAGE. See the same note on `src/app/page.tsx`.
 *
 * Worse here than on the stream: a baked snapshot of the user's directives would
 * show permissions that are not the ones in force. §26 makes a directive
 * revocable with immediate effect, so a page that displays a build-time copy of
 * it actively misreports what the system is permitted to do.
 */
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let services: ReturnType<typeof getServices>;

  try {
    services = getServices();
  } catch {
    return (
      <main>
        <h1>Directives</h1>
        <div className="notice">
          <p>
            <strong>Storage unavailable.</strong> Directives cannot be read or
            changed without a database connection.
          </p>
          <p className="faint">
            Set <code>DATABASE_URL</code> and run{' '}
            <code>npx prisma migrate deploy</code>.
          </p>
        </div>
      </main>
    );
  }

  const active = await services.repositories.directives.listActive();
  const preference = await services.reflection.preference(new Date());

  return (
    <main>
      <h1>Directives</h1>
      <p className="lede">
        Instructions you give the system. These override its own presentation
        logic, and revoking one takes effect immediately.
      </p>

      <h2>Active directives</h2>

      {active.length === 0 ? (
        <div className="notice">
          <p>No directives are active. Nothing is being restricted.</p>
        </div>
      ) : (
        active.map((directive) => (
          <article className="card" key={directive.id}>
            <div className="card-head">
              <span className="faint">{directive.id}</span>
              <form action={revokeDirective}>
                <input type="hidden" name="id" value={directive.id} />
                <button type="submit">Revoke</button>
              </form>
            </div>
            <ul className="card-body muted">
              <li>store: {directive.allowStorage ? 'allowed' : 'forbidden'}</li>
              <li>
                analyse: {directive.allowAnalysis ? 'allowed' : 'forbidden'}
              </li>
              <li>
                show when asked:{' '}
                {directive.allowPassivePresentation ? 'allowed' : 'forbidden'}
              </li>
              <li>
                surface unprompted:{' '}
                {directive.allowProactivePresentation ? 'allowed' : 'forbidden'}
              </li>
            </ul>
            <div className="card-foot">
              <span className="faint">
                applies to future similar:{' '}
                {directive.appliesToFutureSimilar ? 'yes' : 'no'}
              </span>
            </div>
          </article>
        ))
      )}

      <h2>Add a directive</h2>

      <form action={createDirective}>
        <fieldset>
          <legend>What the system may do</legend>

          {/*
            Four independent checkboxes. Not a preset, not a level, not nested.
            Storing and analysing are separate permissions (INV-17).
          */}
          <label>
            <input type="checkbox" name="allowStorage" defaultChecked />
            Store what I record
          </label>
          <label>
            <input type="checkbox" name="allowAnalysis" />
            Analyse it for relations
          </label>
          <label>
            <input type="checkbox" name="allowPassivePresentation" />
            Show me findings when I come looking
          </label>
          <label>
            <input type="checkbox" name="allowProactivePresentation" />
            Surface findings without my asking
          </label>

          <p className="hint">
            These are independent on purpose. Leaving analysis unchecked while
            storage stays checked means: keep a record, draw no conclusions.
          </p>

          <label>
            <input type="checkbox" name="appliesToFutureSimilar" />
            Apply to future similar material
          </label>

          <div className="button-row">
            <button className="primary" type="submit">
              Save directive
            </button>
          </div>
        </fieldset>
      </form>

      <h2>Reflection preference</h2>

      <form action={updatePreference}>
        <fieldset>
          <legend>How much the system says</legend>

          <label htmlFor="hypothesisVisibility">
            Possible explanations
            <select
              id="hypothesisVisibility"
              name="hypothesisVisibility"
              defaultValue={preference.hypothesisVisibility}
            >
              <option value="hidden">Do not show them</option>
              <option value="on_request">Only when I ask</option>
              <option value="shown">Show them</option>
            </select>
          </label>

          <label htmlFor="interventionLevel">
            How often it speaks up
            <select
              id="interventionLevel"
              name="interventionLevel"
              defaultValue={preference.interventionLevel}
            >
              <option value="minimal">Minimal</option>
              <option value="standard">Standard</option>
            </select>
          </label>

          <label htmlFor="explanationDensity">
            How much explanation
            <select
              id="explanationDensity"
              name="explanationDensity"
              defaultValue={preference.explanationDensity}
            >
              <option value="brief">Brief</option>
              <option value="full">Full</option>
            </select>
          </label>

          <p className="hint">
            Preference is current state, with no history kept. Changing it
            overwrites the previous setting.
          </p>

          <div className="button-row">
            <button className="primary" type="submit">
              Save preference
            </button>
          </div>
        </fieldset>
      </form>
    </main>
  );
}
