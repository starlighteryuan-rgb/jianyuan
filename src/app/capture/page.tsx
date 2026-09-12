import { CaptureForm } from './capture-form';

/**
 * Capture surface shell.
 *
 * The page owns presentation only. CaptureForm submits through the dedicated
 * Server Action, while validation, permissions, identity, and persistence stay
 * behind the existing ingestion interface.
 */
export default function CapturePage() {
  return (
    <main>
      <h1>Capture</h1>
      <p className="lede">
        Write something in your own words. When you save, it is stored as a
        Record if your directives and storage allow it. Capture does not
        automatically analyse what you enter.
      </p>

      <CaptureForm />
    </main>
  );
}
