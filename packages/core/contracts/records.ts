import type {
  EpistemicRole,
  MeaningCommitment,
  MeaningEffect,
} from '../domain/shared/enums';
import type { TimeAssertion } from '../domain/shared/time-semantics';

/** Storage- and transport-neutral Record projection for app read paths. */
export interface RecordReadModel {
  readonly id: string;
  readonly verbatim: string | null;
  readonly language: string | null;
  readonly epistemicRoles: readonly EpistemicRole[];
  readonly time: TimeAssertion;
  readonly capturedAt: Date;
  readonly createdAt: Date;
}

export interface ReflectionMeaningReadModel {
  readonly id: string;
  readonly meaningCommitment: MeaningCommitment;
  readonly validAtTime: TimeAssertion;
  readonly currentEffect: MeaningEffect;
  readonly createdAt: Date;
}

export interface RecordReflectionContextReadModel {
  readonly record: RecordReadModel;
  readonly meaningHistory: readonly ReflectionMeaningReadModel[];
}

export interface RecordQueries {
  listRecent(input: {
    readonly limit: number;
  }): Promise<readonly RecordReadModel[]>;
  getById(id: string): Promise<RecordReadModel | null>;
  getReflectionContext(
    recordId: string,
  ): Promise<RecordReflectionContextReadModel | null>;
  search(input: {
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly RecordReadModel[]>;
}
