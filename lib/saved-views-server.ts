import { AppError, requireRole } from './server';
import { storeCall } from './storage';
import { moduleAllowed, validateFilters } from './record-filters';
import type { Actor } from './types';
export function savedViews(a: Actor, module: string) {
  requireRole(a, ['Director', 'Finance', 'TA']);
  if (!moduleAllowed(module, a.role))
    throw new AppError('Your role cannot open this view.', 403);
  return storeCall('view_list', { actorId: a.userId, module });
}
export function savedViewCommand(a: Actor, input: unknown) {
  requireRole(a, ['Director', 'Finance', 'TA']);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AppError('Check the saved view.');
  const v = input as Record<string, unknown>;
  if (typeof v.module !== 'string' || !moduleAllowed(v.module, a.role))
    throw new AppError('Your role cannot open this view.', 403);
  if (
    typeof v.id !== 'string' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v.id) ||
    (v.revision != null &&
      (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1))
  )
    throw new AppError('Refresh the saved view.');
  const args = {
    actorId: a.userId,
    module: v.module,
    id: v.id,
    revision: v.revision ?? null,
  };
  if (v.operation === 'delete') return storeCall('view_delete', args);
  if (
    v.operation !== 'save' ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 80 ||
    !Array.isArray(v.roles) ||
    v.roles.some(
      (r) => typeof r !== 'string' || !moduleAllowed(v.module as string, r),
    )
  )
    throw new AppError('Check the saved view.');
  if (v.roles.length && a.role !== 'Director')
    throw new AppError('Only management can share views.', 403);
  try {
    return storeCall('view_save', {
      ...args,
      name: v.name.trim(),
      roles: v.roles,
      spec: validateFilters(v.module, v.spec),
    });
  } catch (e) {
    throw new AppError(
      e instanceof Error ? e.message : 'Check the saved view.',
    );
  }
}
