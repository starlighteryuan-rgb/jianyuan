'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { restoreLocalData } from '@/server/data-settings';

const MAX_RESTORE_BYTES = 20 * 1024 * 1024;

export async function restoreData(form: FormData): Promise<void> {
  if (form.get('confirmRestore') !== 'on') {
    redirect('/settings?restore=confirmation-required');
  }

  const upload = form.get('backup');
  if (!(upload instanceof File) || upload.size === 0) {
    redirect('/settings?restore=file-required');
  }
  if (upload.size > MAX_RESTORE_BYTES) {
    redirect('/settings?restore=file-too-large');
  }

  try {
    await restoreLocalData(await upload.text());
  } catch {
    redirect('/settings?restore=invalid-backup');
  }

  revalidatePath('/');
  revalidatePath('/history');
  revalidatePath('/settings');
  redirect('/settings?restore=complete');
}
