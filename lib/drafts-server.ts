import { AppError, requireRole } from './server';
import { storeCall } from './storage';
import { draftKinds } from './drafts';
import type { Actor } from './types';
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export function listDrafts(a: Actor) {
  requireRole(a, ['Director', 'Finance']);
  return storeCall('draft_list', { actorId: a.userId });
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function draftCommand(a: Actor, input: unknown) {
  requireRole(a, ['Director', 'Finance']);
  if (!object(input)) throw new AppError('Choose a draft.');
  if (!uuid(input.id)) throw new AppError('Choose a draft.');
  if (
    input.revision != null &&
    (typeof input.revision !== 'number' ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 1)
  )
    throw new AppError('Refresh the draft.');
  const args: Record<string, unknown> = {
    actorId: a.userId,
    id: input.id,
    revision: input.revision ?? null,
  };
  if (input.operation === 'delete') return storeCall('draft_delete', args);
  if (
    input.operation !== 'save' ||
    typeof input.kind !== 'string' ||
    !draftKinds(a.role).includes(input.kind)
  )
    throw new AppError('Your role cannot save this draft.', 403);
  if (
    input.recordId != null &&
    (typeof input.recordId !== 'string' || input.recordId.length > 200)
  )
    throw new AppError('Choose a record.');
  if (
    input.recordRevision != null &&
    (typeof input.recordRevision !== 'number' ||
      !Number.isSafeInteger(input.recordRevision) ||
      input.recordRevision < 1)
  )
    throw new AppError('Refresh the record.');
  const p = input.payload;
  if (
    !object(p) ||
    !p.data ||
    typeof p.data !== 'object' ||
    Array.isArray(p.data) ||
    typeof p.reason !== 'string' ||
    p.reason.length > 1000 ||
    JSON.stringify(p).length > 60000
  )
    throw new AppError('Check the draft contents.');
  if (
    p.retry &&
    (!object(p.retry) ||
      typeof p.retry.key !== 'string' ||
      p.retry.key.length > 60000 ||
      (p.retry.id && !uuid(p.retry.id)))
  )
    throw new AppError('Check the draft contents.');
  return storeCall('draft_save', {
    ...args,
    kind: input.kind,
    recordId: input.recordId || null,
    recordRevision: input.recordRevision ?? null,
    payload: {
      data: p.data,
      reason: p.reason,
      ...(p.retry ? { retry: p.retry } : {}),
    },
  });
}
