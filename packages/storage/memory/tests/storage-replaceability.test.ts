import { describe, expect, it } from 'vitest';

import {
  type Directive,
  type EpistemicRole,
  type IngestionPlan,
  type LineageEdge,
  type PersonalRecord,
  type ReflectionEpisode,
  type ReflectionPreference,
  type StateAssignment,
  type StoredRelationClaim,
  type UserReflectionRecord,
} from '../../../core/index';
import { createMemoryStorage } from '../index';
import {
  runAwarenessUseCase,
  type UseCaseStorage,
} from './storage-contract';

/**
 * Independent array/map-backed contract double. It intentionally does not use
 * any production Memory repository implementation.
 */
const createArrayStorageContractDouble = (): UseCaseStorage => {
  const records = new Map<string, PersonalRecord>();
  const roles = new Map<string, Set<EpistemicRole>>();
  const lineage: LineageEdge[] = [];
  const directives = new Map<string, Directive>();
  const relations = new Map<string, StoredRelationClaim>();
  const states = new Map<string, StateAssignment>();
  const episodes: ReflectionEpisode[] = [];
  const reflectionRecords = new Map<string, UserReflectionRecord>();
  let preference: ReflectionPreference | null = null;

  const recordPort: UseCaseStorage['records'] = {
    findById: async (id) => records.get(id) ?? null,
    findBySourceFingerprint: async (fingerprint) =>
      [...records.values()].find(
        (record) => record.sourceFingerprint === fingerprint,
      ) ?? null,
    findByEvidenceUnit: async (unitId) =>
      [...records.values()].filter(
        (record) => record.evidenceUnitId === unitId,
      ),
    countDistinctEvidenceUnits: async (ids) =>
      new Set(
        ids.map((id) => records.get(id)?.evidenceUnitId).filter(Boolean),
      ).size,
    listRecent: async (limit) => [...records.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, Math.max(0, limit)),
    searchText: async (query, limit) => [...records.values()]
      .filter((record) =>
        (record.rawExpression?.verbatim ?? '').includes(query),
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, Math.max(0, limit)),
    save: async (record) => {
      records.set(record.id, record);
    },
  };

  const rolePort: UseCaseStorage['roles'] = {
    listRoles: async (recordId) => [...(roles.get(recordId) ?? [])],
    addRole: async (assignment) => {
      const assigned = roles.get(assignment.recordId) ?? new Set<EpistemicRole>();
      assigned.add(assignment.role);
      roles.set(assignment.recordId, assigned);
    },
  };

  const lineagePort: UseCaseStorage['lineage'] = {
    directParents: async (childId) =>
      lineage.filter((edge) => edge.childId === childId),
    save: async (edge) => {
      lineage.push(edge);
    },
  };

  const directivePort: UseCaseStorage['directives'] = {
    findById: async (id) => directives.get(id) ?? null,
    listActive: async () => [...directives.values()].filter(
      (directive) => directive.revokedAt === null,
    ),
    save: async (directive) => {
      directives.set(directive.id, directive);
    },
    revoke: async (id, at) => {
      const directive = directives.get(id);
      if (directive !== undefined) directives.set(id, { ...directive, revokedAt: at });
    },
  };

  const commitPort: UseCaseStorage['ingestion'] = {
    commit: async (plan: IngestionPlan) => {
      const recordId = plan.kind === 'create' ? plan.record.id : plan.recordId;
      if (plan.kind === 'create') await recordPort.save(plan.record);
      for (const role of plan.rolesToAdd) {
        await rolePort.addRole({ recordId, role });
      }
      if (plan.lineageEdge !== null) {
        await lineagePort.save({
          ...plan.lineageEdge,
          createdAt:
            plan.kind === 'create' ? plan.record.createdAt : new Date(0),
        });
      }
    },
  };

  return {
    records: recordPort,
    roles: rolePort,
    lineage: lineagePort,
    directives: directivePort,
    ingestion: commitPort,
    relationClaims: {
      findById: async (id) => relations.get(id) ?? null,
      findByRecordRef: async (recordId) => [...relations.values()].filter(
        (relation) => relation.recordRefs.includes(recordId),
      ),
      listBySupportLevel: async (level) => [...relations.values()].filter(
        (relation) => relation.supportLevel === level,
      ),
      listAll: async (limit) => [...relations.values()]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, Math.max(0, limit)),
      save: async (relation) => {
        relations.set(relation.id, relation);
      },
    },
    stateAssignments: {
      findByTarget: async (targetType, targetRef) =>
        [...states.values()].find(
          (state) =>
            state.targetType === targetType && state.targetRef === targetRef,
        ) ?? null,
      save: async (state) => {
        states.set(state.id, state);
      },
      findById: async (id) => states.get(id) ?? null,
    },
    reflectionPreferences: {
      find: async () => preference,
      save: async (nextPreference) => {
        preference = nextPreference;
      },
    },
    reflectionEpisodes: {
      save: async (episode) => {
        episodes.push(episode);
      },
      listByTarget: async (targetRef) =>
        episodes
          .filter((episode) => episode.targetRef === targetRef)
          .sort(
            (left, right) =>
              right.occurredAt.getTime() - left.occurredAt.getTime(),
          ),
    },
    userReflectionRecords: {
      save: async (record) => {
        reflectionRecords.set(record.id, record);
      },
      listByRecord: async (recordId) => [...reflectionRecords.values()].filter(
        (record) => record.recordId === recordId,
      ),
      listByEpisode: async (episodeRef) =>
        [...reflectionRecords.values()]
          .filter((record) => record.episodeRef === episodeRef)
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime(),
          ),
    },
  };
};

describe('storage adapter replaceability', () => {
  it('runs the same Core use case unchanged against two adapters', async () => {
    const memoryResult = await runAwarenessUseCase(createMemoryStorage());
    const alternateResult = await runAwarenessUseCase(
      createArrayStorageContractDouble(),
    );

    expect(alternateResult).toEqual(memoryResult);
  });
});
