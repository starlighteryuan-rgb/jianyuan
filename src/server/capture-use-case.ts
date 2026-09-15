import type {
  CaptureIngestionPort,
  CaptureIngestionResult,
} from './capture-composition-root';

export interface CaptureCommand {
  readonly verbatim: string;
  readonly submissionId: string;
  readonly submittedAt: Date;
  readonly capturedAt: Date;
}

/**
 * One transport-independent Capture use case shared by both composition modes.
 * Web validation happens before this function; epistemic and storage decisions
 * remain inside Core IngestionService or the explicitly selected legacy graph.
 */
export const executeCapture = (
  ingestion: CaptureIngestionPort,
  command: CaptureCommand,
): Promise<CaptureIngestionResult> => ingestion.ingest({
  origin: 'user_reported',
  actor: 'user',
  sourceRef: `capture-ui:${command.submissionId}`,
  verbatim: command.verbatim,
  language: null,
  time: { semantic: 'capture_time', at: command.submittedAt },
  epistemicRoles: ['user_expression'],
  capturedAt: command.capturedAt,
  derivation: null,
  subject: {
    topicTags: [],
    source: 'capture_ui',
    relationAxes: [],
    userSelectedRefs: [],
  },
});
