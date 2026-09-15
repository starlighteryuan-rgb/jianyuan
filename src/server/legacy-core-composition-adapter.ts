/**
 * Temporary adapter from the duplicate legacy Domain/Application graph to the
 * Phase 3.5 composition interface. It is loaded only in explicit fallback mode.
 */
import type { ReflectionFeedback } from '@/domain/reflection/response-routing';
import type {
  ExplanationDensity,
  HypothesisVisibility,
  InterventionLevel,
} from '@/domain/shared/enums';
import { relationClaimId } from '@/domain/shared/ids';
import type { AppServices } from '@/server/container';
import { createLegacyRecordQueries } from '@/server/legacy-record-query-adapter';
import { DisabledAIProvider } from '../../packages/providers/ai/index';

export const createLegacyCoreCompositionAdapter = (services: AppServices) => {
  const getRelationTarget = async (targetRef: string, now: Date) => {
    const relation = await services.repositories.claims.findById(
      relationClaimId(targetRef),
    );
    if (relation === null) return null;

    return {
      relation: {
        id: relation.id,
        recordRefs: relation.recordRefs,
        relationType: relation.relationType,
        question: relation.comparisonAxis.question,
        dimension: relation.comparisonAxis.dimension,
        evidenceSummary: relation.evidenceSummary,
        supportLevel: relation.supportLevel,
        createdAt: relation.createdAt,
      },
      preference: await services.reflection.preference(now),
    };
  };

  const respondToRelation = async (input: {
    readonly targetRef: string;
    readonly feedback: ReflectionFeedback;
    readonly now: Date;
  }) => {
    const relation = await services.repositories.claims.findById(
      relationClaimId(input.targetRef),
    );
    if (relation === null) return null;

    const hypotheses = await services.repositories.hypotheses.findByAnchorRef(
      relation.id,
    );
    const invitation = await services.reflection.invite({
      target: {
        targetType: 'relation_claim',
        targetRef: relation.id,
        relation,
        hypotheses,
      },
      now: input.now,
    });

    return services.reflection.respond({
      episode: invitation.episode,
      feedback: input.feedback,
      subject: {
        topicTags: [],
        source: null,
        relationAxes: [relation.comparisonAxis.dimension],
        userSelectedRefs: [relation.id],
      },
      targetType: 'relation_claim',
      targetRef: relation.id,
      now: input.now,
    });
  };

  const updatePreference = async (input: {
    readonly hypothesisVisibility: HypothesisVisibility;
    readonly interventionLevel: InterventionLevel;
    readonly explanationDensity: ExplanationDensity;
    readonly now: Date;
  }) => {
    const current = await services.reflection.preference(input.now);
    const updated = {
      ...current,
      hypothesisVisibility: input.hypothesisVisibility,
      interventionLevel: input.interventionLevel,
      explanationDensity: input.explanationDensity,
      updatedAt: input.now,
    };
    await services.repositories.preferences.save(updated);
    return updated;
  };

  return {
    mode: 'legacy' as const,
    ai: new DisabledAIProvider(),
    ingestion: { ingest: services.ingestion.ingest.bind(services.ingestion) },
    records: createLegacyRecordQueries(services.repositories),
    directives: {
      listActive: services.repositories.directives.listActive.bind(
        services.repositories.directives,
      ),
      create: services.directives.create.bind(services.directives),
      revoke: services.directives.revoke.bind(services.directives),
    },
    relations: { evaluate: services.relations.evaluate.bind(services.relations) },
    hypotheses: {
      evaluate: services.hypotheses.evaluate.bind(services.hypotheses),
    },
    discovery: {
      listStream: services.discovery.listStream.bind(services.discovery),
    },
    reflection: {
      preference: services.reflection.preference.bind(services.reflection),
      updatePreference,
    },
    reflectionFlow: { getRelationTarget, respondToRelation },
  };
};
