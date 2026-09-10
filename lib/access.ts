import type { Actor } from './types';

/** Changing identity or scope must also discard client-side private view state. */
export function accessScope(actor: Actor) {
  return JSON.stringify([
    actor.userId,
    actor.role,
    actor.active,
    [...actor.classIds].sort(),
  ]);
}

export function homeView(role: Actor['role']) {
  return role === 'TA'
    ? 'Attendance'
    : role === 'Finance'
      ? 'Finance'
      : 'Overview';
}

export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function isAccessDenied(error: unknown) {
  return error instanceof AccessError && [401, 403, 428].includes(error.status);
}
