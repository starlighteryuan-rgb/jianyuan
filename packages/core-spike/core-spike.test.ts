import { describe, expect, it } from 'vitest';
import { applyDirective, completeReflection, createCoreSpikeState, createRecord, createRelation, generateDiscoveryCandidate, makeGlobalDirective } from './index';

describe('Shared Core boundary spike', () => {
  it('runs Record to Relation to Discovery to Reflection with memory only', () => {
    const state = createCoreSpikeState();
    const first = createRecord(state, { id: 'record-1', text: '我先把任务拆成一个具体的下一步。', at: new Date('2026-01-01T00:00:00.000Z') });
    const second = createRecord(state, { id: 'record-2', text: '面对新的任务时，我又先写下了最小动作。', at: new Date('2026-02-01T00:00:00.000Z') });
    expect(state.records.size).toBe(2);
    const relation = createRelation(state, { id: 'relation-1', recordRefs: [first.id, second.id] });
    expect(relation.assessment?.supportLevel).toBe('observed');
    const discovery = generateDiscoveryCandidate(state, relation, new Date('2026-02-02T00:00:00.000Z'));
    expect(discovery.discovery.subjectRef.type).toBe('relation_claim');
    const completed = completeReflection(state, relation.id, { response: 'questioned', freeText: '我想先继续观察。', leaveForNow: false, userInitiatedContinuation: false }, new Date('2026-02-03T00:00:00.000Z'));
    expect(completed.invitation.exits).toHaveLength(3);
    expect(completed.decision.createsReflectionRecord).toBe(true);
    expect(state.reflections).toHaveLength(1);
  });

  it('directive permissions change behavior without UI or database', () => {
    const state = createCoreSpikeState();
    const subject = { topicTags: [], source: 'core-spike', relationAxes: ['行动启动顺序'], userSelectedRefs: ['relation-1'], createdAt: new Date('2026-02-01T00:00:00.000Z') };
    expect(applyDirective(state, subject).allowPassivePresentation).toBe(true);
    state.directives.push(makeGlobalDirective('directive-1', { allowAnalysis: true, allowStorage: true, allowPassivePresentation: false, allowProactivePresentation: false }));
    const permissions = applyDirective(state, subject);
    expect(permissions.allowPassivePresentation).toBe(false);
    expect(permissions.appliedDirectiveIds).toHaveLength(1);
  });
});
