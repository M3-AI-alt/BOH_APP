import { env } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { AppError, requireRole } from './server';
import { listRecords, storeCall } from './storage';
import { parsePreparationFile } from './preparation-file';
import { reviewPreparation } from './preparation-review';
import type { Actor } from './types';
import type {
  PreparationHistoryPage,
  PreparationSavedReview,
  PreparationSaveResult,
} from './preparation-types';
export function preparationAccess(a: Actor) {
  requireRole(a, ['Director', 'Finance']);
}
export async function preparationCommand(a: Actor, input: unknown) {
  preparationAccess(a);
  if (
    typeof input !== 'object' ||
    input === null ||
    !('action' in input) ||
    !('xlsx' in input) ||
    (input.action !== 'preview' && input.action !== 'stage') ||
    typeof input.xlsx !== 'string'
  )
    throw new AppError('Choose a preparation workbook and preview it first.');
  let parsed;
  try {
    parsed = await parsePreparationFile(
      input.xlsx,
      env.SUPABASE_SECRET_KEY || '',
    );
  } catch (e) {
    throw new AppError(
      e instanceof Error ? e.message : 'Unable to read preparation workbook.',
    );
  }
  // Recover an already-saved command before recalculating against newer BOH
  // records. Both the signed file and its exact bytes must match the first save.
  if (
    input.action === 'stage' &&
    'digest' in input &&
    typeof input.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(input.digest)
  ) {
    const existing: PreparationSavedReview | null = await storeCall(
      'prep_retry',
      {
        actorId: a.userId,
        digest: input.digest,
        fileHash: parsed.fileHash,
      },
    );
    if (existing)
      return {
        ...existing.payload,
        digest: existing.digest,
        id: existing.id,
        saved: true,
        reused: true,
        financialChanges: 0,
      };
  }
  const review = reviewPreparation(
    parsed.baseline,
    parsed.submissions,
    await listRecords(),
  );
  const digest = createHash('sha256')
    .update(JSON.stringify(review))
    .digest('hex');
  if (input.action === 'preview') return { ...review, digest };
  if (!('digest' in input) || input.digest !== digest)
    throw new AppError(
      'BOH or the workbook changed since preview. Preview again before saving.',
      409,
    );
  if (
    !('fileName' in input) ||
    typeof input.fileName !== 'string' ||
    !input.fileName.trim() ||
    input.fileName.length > 250 ||
    // A file label must not contain hidden controls or line breaks.
    // oxlint-disable-next-line no-control-regex
    /[\u0000-\u001F]/.test(input.fileName)
  )
    throw new AppError('Use a valid file name.');
  // Staging retains incomplete/conflicting proposals. There is intentionally no
  // convert/post operation until each destination workflow passes acceptance.
  const saved: PreparationSaveResult = await storeCall('prep_stage', {
    actorId: a.userId,
    digest,
    fileHash: parsed.fileHash,
    fileName: input.fileName,
    payload: review,
  });
  return { ...review, digest, ...saved };
}
export async function listPreparation(a: Actor, q: URLSearchParams) {
  preparationAccess(a);
  const id = q.get('id');
  if (id) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
      throw new AppError('Choose a saved review.');
    const saved: PreparationSavedReview | null = await storeCall('prep_get', {
      actorId: a.userId,
      id,
    });
    if (!saved) throw new AppError('Review not found.', 404);
    const current = new Map((await listRecords()).map((r) => [r.id, r]));
    let stale = 0;
    for (const row of saved.payload.rows)
      if (
        row.recordId &&
        current.get(row.recordId)?.revision !== row.currentRevision
      )
        stale++;
    // A saved report is evidence at its save time, never current approval.
    return { ...saved, staleRecords: stale };
  }
  const offset = Number(q.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e6)
    throw new AppError('Invalid page.');
  const page: PreparationHistoryPage = await storeCall('prep_list', {
    actorId: a.userId,
    offset,
  });
  return page;
}
