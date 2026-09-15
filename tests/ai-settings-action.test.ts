import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configure, refreshModels, selectModel, testConnection, revalidatePath } =
  vi.hoisted(() => ({
    configure: vi.fn(),
    refreshModels: vi.fn(),
    selectModel: vi.fn(),
    testConnection: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock('@/server/ai-settings-runtime', () => ({
  getAISettingsRuntime: () => ({
    configure,
    refreshModels,
    selectModel,
    testConnection,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath }));

import {
  refreshAIModels,
  saveAIProviderSettings,
  selectAIModel,
  testAIConnection,
} from '../src/app/actions/ai-settings';

describe('AI Settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps untrusted form values into the product runtime facade', async () => {
    const form = new FormData();
    form.set('enabled', 'on');
    form.set('providerId', 'provider');
    form.set('baseUrl', 'https://provider.example/v1');
    form.set('apiKey', 'secret');
    form.set('model', 'model-a');

    await saveAIProviderSettings(form);

    expect(configure).toHaveBeenCalledWith({
      enabled: true,
      providerId: 'provider',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'model-a',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('routes discovery, connection test and selection through one facade', async () => {
    const form = new FormData();
    form.set('model', 'model-b');

    await refreshAIModels();
    await testAIConnection();
    await selectAIModel(form);

    expect(refreshModels).toHaveBeenCalledOnce();
    expect(testConnection).toHaveBeenCalledOnce();
    expect(selectModel).toHaveBeenCalledWith('model-b');
  });
});
