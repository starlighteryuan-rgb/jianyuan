'use server';

import { revalidatePath } from 'next/cache';

import { getAISettingsRuntime } from '@/server/ai-settings-runtime';

const textValue = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

export async function saveAIProviderSettings(form: FormData): Promise<void> {
  getAISettingsRuntime().configure({
    enabled: form.get('enabled') === 'on',
    providerId: textValue(form, 'providerId'),
    baseUrl: textValue(form, 'baseUrl'),
    apiKey: textValue(form, 'apiKey'),
    model: textValue(form, 'model'),
  });
  revalidatePath('/settings');
}

export async function refreshAIModels(): Promise<void> {
  await getAISettingsRuntime().refreshModels();
  revalidatePath('/settings');
}

export async function testAIConnection(): Promise<void> {
  await getAISettingsRuntime().testConnection();
  revalidatePath('/settings');
}

export async function selectAIModel(form: FormData): Promise<void> {
  getAISettingsRuntime().selectModel(textValue(form, 'model'));
  revalidatePath('/settings');
}
