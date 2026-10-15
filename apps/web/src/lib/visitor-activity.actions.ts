'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

/** Invalidate the home summary after the API has acknowledged displayed activity. */
export async function refreshVisitorHomeActivity() {
  await requireAuth();
  revalidatePath('/home');
}
