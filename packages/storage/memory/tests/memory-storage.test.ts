import { describe, expect, it } from 'vitest';

import { relationClaimId } from '../../../core/index';
import { createMemoryStorage } from '../index';
import { runAwarenessUseCase } from './storage-contract';

describe('MemoryStorageAdapter', () => {
  it('persists and queries Record, Relation, and Reflection through Core ports', async () => {
    const result = await runAwarenessUseCase(createMemoryStorage());

    expect(result).toEqual({
      recordText: '我先把任务拆成一个具体动作。',
      relationId: relationClaimId('memory-relation-1'),
      reflectionText: '我想继续观察这是不是稳定做法。',
      reflectionCount: 1,
    });
  });
});
