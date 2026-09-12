/**
 * Runtime Validation Case N-004 — Reflection Boundary / User Feedback
 * Non-Escalation.
 *
 * This test exercises only the Reflection application path over Memory
 * repositories. It deliberately does not evaluate a Relation, Hypothesis, or
 * Discovery.
 */

import { describe, expect, it } from 'vitest';

import { ReflectionService } from '@/application/reflection-service';
import type { ReflectionEpisode } from '@/domain/reflection/reflection-episode';
import { INFERS_STABLE_IDENTITY, defaultPreference } from '@/domain/reflection/reflection-preference';
import type { PersonalRecord } from '@/domain/record/record';
import { DeterministicSemanticJudgment } from '@/infra/fake/deterministic-semantic-judgment';
import { createServices, memoryRepositories } from '@/server/container';
import { evidenceUnitId, recordId, sourceFingerprint } from '@/domain/shared/ids';

const T0 = new Date('2026-02-10T09:00:00.000Z');
const T1 = new Date('2026-02-10T09:05:00.000Z');

const seedRecord: PersonalRecord = {
  id: recordId('rec-n004-baseline'),
  sourceFingerprint: sourceFingerprint('fp-n004-baseline'),
  evidenceUnitId: evidenceUnitId('eu-n004-baseline'),
  epistemicRoles: ['user_expression'],
  provenance: {
    origin: 'user_reported',
    actor: 'user',
    sourceRef: 'capture-ui:n004-baseline',
    capturedAt: T0,
  },
  time: { semantic: 'capture_time', at: T0 },
  rawExpression: {
    verbatim: '我想先停一下，看看这个说法是否适合我。',
    language: 'zh',
  },
  createdAt: T0,
};

const targetRef = 'fixture-only-reflection-target-n004';

describe('Runtime Validation N-004 — Reflection boundary', () => {
  it('records an episode and button feedback without epistemic escalation', async () => {
    const repositories = memoryRepositories();
    const savedEpisodes: ReflectionEpisode[] = [];
    const episodeStore = repositories.episodes;
    const judgment = new DeterministicSemanticJudgment();
    const relationRepositoryCalls = { value: 0 };
    const discoveryRepositoryCalls = { value: 0 };
    const claims = new Proxy(repositories.claims, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function'
          ? (...args: readonly unknown[]) => {
              relationRepositoryCalls.value += 1;
              return value.apply(target, args);
            }
          : value;
      },
    });
    const discoveries = new Proxy(repositories.discoveries, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function'
          ? (...args: readonly unknown[]) => {
              discoveryRepositoryCalls.value += 1;
              return value.apply(target, args);
            }
          : value;
      },
    });

    await repositories.records.save(seedRecord);

    const services = createServices(
      {
        ...repositories,
        claims,
        discoveries,
        episodes: {
          async save(episode: ReflectionEpisode): Promise<void> {
            savedEpisodes.push(episode);
            await episodeStore.save(episode);
          },
        },
      },
      { judgment },
    );

    const target = {
      targetType: 'relation_claim' as const,
      targetRef,
      relation: null,
      hypotheses: [],
    };

    const invite = await services.reflection.invite({ target, now: T0 });

    expect(savedEpisodes).toHaveLength(1);
    expect(savedEpisodes[0]).toEqual(invite.episode);
    expect(invite.episode).toMatchObject({
      elicitationMode: 'prompted',
      stimulusType: 'open_question',
      systemFollowupCount: 0,
      stimulusRef: targetRef,
      targetRef,
    });
    expect(invite.episode).not.toHaveProperty('meaningCommitment');
    expect(invite.episode).not.toHaveProperty('userPosition');

    const recordsBefore = await repositories.records.listRecent(10);
    const preferenceBefore = await services.reflection.preference(T0);
    const evidenceUnitBefore = (await repositories.records.findById(seedRecord.id))
      ?.evidenceUnitId;

    const response = await services.reflection.respond({
      episode: invite.episode,
      feedback: {
        response: 'accepted',
        freeText: null,
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      subject: {
        topicTags: [],
        source: null,
        relationAxes: [],
        userSelectedRefs: [],
      },
      targetType: 'relation_claim',
      targetRef,
      now: T0,
    });

    expect(response.decision.userPosition).toBe('agrees');
    expect(response.decision.captureText).toBeNull();
    expect(response.decision.createsReflectionRecord).toBe(false);
    expect(response.recordId).toBeNull();
    expect(response.reflectionRecord).toBeNull();
    expect(response.promptShaped).toBe(false);

    const state = await repositories.states.findByTarget('relation_claim', targetRef);
    expect(state).toMatchObject({
      targetType: 'relation_claim',
      targetRef,
      userPosition: 'agrees',
      workflowState: 'active',
      presentationState: 'active',
    });

    const recordsAfter = await repositories.records.listRecent(10);
    const evidenceUnitAfter = (await repositories.records.findById(seedRecord.id))
      ?.evidenceUnitId;

    expect(recordsAfter).toHaveLength(recordsBefore.length);
    expect(recordsAfter[0]).toEqual(recordsBefore[0]);
    expect(evidenceUnitAfter).toBe(evidenceUnitBefore);
    expect(
      await repositories.records.countDistinctEvidenceUnits([seedRecord.id]),
    ).toBe(1);

    const preferenceAfterFeedback = await services.reflection.preference(T0);
    expect(preferenceAfterFeedback).toEqual(preferenceBefore);
    expect(
      await services.reflection.mayAskFollowUp({
        episode: invite.episode,
        userInitiatedContinuation: false,
        now: T0,
      }),
    ).toBe(true);

    await repositories.preferences.save({
      ...preferenceBefore,
      interventionLevel: 'minimal',
      updatedAt: T1,
    });

    expect(
      await services.reflection.mayAskFollowUp({
        episode: invite.episode,
        userInitiatedContinuation: false,
        now: T1,
      }),
    ).toBe(false);

    expect(await repositories.hypotheses.listAll()).toEqual([]);
    expect(relationRepositoryCalls.value).toBe(0);
    expect(discoveryRepositoryCalls.value).toBe(0);
    expect(judgment.calls.generateCandidates).toBe(0);
    expect(judgment.calls.judgeComparability).toBe(0);
    expect(judgment.calls.judgeAbstractionCeiling).toBe(0);
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
    expect(judgment.calls.generateHypotheses).toBe(0);
    expect(judgment.calls.judgeHypothesisAbstractionCeiling).toBe(0);
  });

  it('keeps interaction preferences non-identity-bearing', () => {
    const preference = defaultPreference(T0);

    expect(INFERS_STABLE_IDENTITY).toBe(false);
    expect(preference).not.toHaveProperty('personality');
    expect(preference).not.toHaveProperty('trait');
    expect(preference).not.toHaveProperty('permanentIdentity');
    expect(preference).not.toHaveProperty('stability');
  });
});
