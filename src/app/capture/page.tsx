import { DemoCaptureJourney } from '../_components/demo-capture-journey';

/**
 * Capture surface shell.
 *
 * The page owns presentation only. CaptureForm submits through the dedicated
 * Server Action, while validation, permissions, identity, and persistence stay
 * behind the existing ingestion interface.
 */
export default function CapturePage() {
  return <DemoCaptureJourney />;
}
