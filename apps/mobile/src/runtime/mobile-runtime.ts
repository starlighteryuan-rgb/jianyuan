/**
 * Mobile runtime — the single entry point UI code is allowed to call.
 *
 * Components talk to `MobileRuntime`, never to Core services or to the storage
 * adapter. That keeps one place where a capture is shaped, where a Record list
 * is read, and where runtime status is reported, so the Record semantics cannot
 * drift between screens.
 *
 * CAPTURE SHAPE
 * Deliberately the same shape Desktop sends to IngestionService, with the
 * source tag changed to `mobile_ui`:
 *   origin   user_reported — the user is reporting their own experience
 *   actor    user
 *   roles    ['user_expression'] — exactly one role, never inferred
 *   time     capture_time — no event time is asserted, because the user did not
 *            state when it happened; asserting one would invent chronology
 *   derivation null — M1 has no derived capture
 *   subject  empty directive attributes — nothing is inferred for scoping
 *
 * NO AI ON SAVE
 * `capture` touches only ingestion. There is no provider call anywhere in this
 * method or below it in the Mobile path, which is the invariant the Record
 * screen depends on and that tests/record-does-not-call-ai.test.ts asserts.
 */

import { recordId } from '../../../../packages/core/index';
import type {
  IngestionOutcome,
  RecordReadModel,
} from '../../../../packages/core/index';

import type { MobileComposition } from './composition-root';
import { mobileAnalysisPermissionFor } from './composition-root';
import { AI_API_KEY_SECRET_NAME } from './secret-store';

/** Default size for the recent-records timeline. */
export const DEFAULT_TIMELINE_LIMIT = 50;

/** Maximum the UI will ask for; Core caps reads at 100 regardless. */
export const MAX_TIMELINE_LIMIT = 100;

export type CaptureFailureKind =
  | 'empty_input'
  | 'storage_not_permitted'
  | 'core_refusal';

export interface CaptureFailure {
  readonly kind: CaptureFailureKind;
  readonly message: string;
}

export type CaptureResult =
  | { readonly ok: true; readonly outcome: IngestionOutcome }
  | { readonly ok: false; readonly failure: CaptureFailure };

/**
 * The user-facing acknowledgement after a Record is saved.
 *
 * Stated once, here, so every save path shows the same words.
 */
export const RECORD_SAVED_MESSAGE = '已经记下来了。';

export class MobileRuntime {
  constructor(readonly composition: MobileComposition) {}

  /**
   * Save one Record from the user's own wording.
   *
   * The verbatim text is trimmed for the empty check ONLY. What is stored is
   * the user's original string, unmodified: Core preserves modal markers such as
   * 可能 / 好像 / 我觉得, and normalising them here would violate §4.2.
   */
  async capture(rawVerbatim: string, now: Date = new Date()): Promise<CaptureResult> {
    if (rawVerbatim.trim().length === 0) {
      return {
        ok: false,
        failure: { kind: 'empty_input', message: '请先写下一句你自己的话。' },
      };
    }

    const result = await this.composition.ingestion.ingest({
      origin: 'user_reported',
      actor: 'user',
      // A fresh source ref per capture. Identity is still content-derived:
      // computeSourceFingerprint hashes the canonical source string, so two
      // captures of the same wording with different refs are two sources. This
      // matches Desktop, whose ref is also a fresh UUID per capture.
      sourceRef: `mobile:capture:${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      verbatim: rawVerbatim,
      language: null,
      time: { semantic: 'capture_time', at: now },
      epistemicRoles: ['user_expression'],
      capturedAt: now,
      derivation: null,
      subject: {
        topicTags: [],
        source: 'mobile_ui',
        relationAxes: [],
        userSelectedRefs: [],
      },
    });

    if (!result.ok) {
      const kind = result.error.kind === 'storage_not_permitted'
        ? 'storage_not_permitted'
        : 'core_refusal';
      return {
        ok: false,
        failure: {
          kind,
          message:
            kind === 'storage_not_permitted'
              ? '你已经设置过不允许保存这类内容。'
              : '这条记录没有被保存。',
        },
      };
    }

    return { ok: true, outcome: result.value };
  }

  /** Recent Records, newest first, for the timeline. */
  async listRecent(limit: number = DEFAULT_TIMELINE_LIMIT): Promise<readonly RecordReadModel[]> {
    const capped = Math.min(Math.max(limit, 1), MAX_TIMELINE_LIMIT);
    return this.composition.records.listRecent({ limit: capped });
  }

  async getRecord(id: string): Promise<RecordReadModel | null> {
    return this.composition.records.getById(id);
  }

  /** Search over preserved Record wording. */
  async search(query: string, limit: number = DEFAULT_TIMELINE_LIMIT): Promise<readonly RecordReadModel[]> {
    return this.composition.records.search({ query, limit });
  }

  /**
   * Runtime status for the Settings screen.
   *
   * Reports where the database lives, which schema version it is on, and whether
   * the Keychain is usable. It never reports a key value — only availability.
   */
  status() {
    return {
      product: '见渊',
      platform: 'mobile',
      databaseLocation: this.composition.storage.location,
      schemaVersion: this.composition.storage.schemaVersion,
      ai: { providerId: this.composition.ai.providerId, enabled: this.composition.ai.enabled },
      secretStore: this.composition.secretStore.status(),
      secretStoreKeyPresent: false,
    };
  }

  /** Directive permissions for a Mobile subject, resolved on read. */
  async analysisPermissionFor(input: {
    readonly source: string | null;
    readonly relationAxes: readonly string[];
    readonly userSelectedRefs: readonly string[];
    readonly createdAt: Date;
  }) {
    return mobileAnalysisPermissionFor(this.composition, input);
  }

  /**
   * Whether a Provider key is currently stored.
   *
   * Returns a boolean, never the key. M1 has no key-entry UI, so this exists to
   * let Settings state the truth instead of guessing.
   */
  async hasStoredApiKey(): Promise<boolean> {
    const value = await this.composition.secretStore.read(AI_API_KEY_SECRET_NAME);
    return value !== null && value.length > 0;
  }

  /** Convenience branding for ids held by the UI. */
  toRecordId(id: string) {
    return recordId(id);
  }
}

export { createPlatformServices, type MobilePlatformServices } from './platform-services';
export {
  createMobileComposition,
  type MobileComposition,
  type MobileCompositionOptions,
} from './composition-root';
