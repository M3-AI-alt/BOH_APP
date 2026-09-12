import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { storeCall } from './storage';
import type { Actor } from './types';

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}
export const cookieName =
  process.env.NODE_ENV === 'development'
    ? 'boh-session-dev'
    : '__Host-boh-session';
export async function hashToken(value: string) {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function authClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw new AuthError('Sign-in is temporarily unavailable.', 503);
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function sessionToken() {
  return (await cookies()).get(cookieName)?.value ?? '';
}
export async function passwordSession() {
  const token = await sessionToken();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return storeCall('auth_session', { tokenHash: await hashToken(token) });
}
export async function passwordActor(): Promise<Actor> {
  const row = await passwordSession();
  if (!row)
    throw new AuthError(
      'Please sign in with your staff email and password.',
      401,
    );
  if (row.must_change_password || row.setup_only)
    throw new AuthError(
      'Set your own password before opening the workspace.',
      428,
    );
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    classIds: row.class_ids,
    allClasses: row.role === 'TA',
    active: row.active,
  };
}
export function withSessionCookie(
  response: Response,
  token: string,
  maxAge: number,
) {
  response.headers.append(
    'Set-Cookie',
    `${cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'development' ? '' : '; Secure'}`,
  );
  return response;
}
export async function limitAuth(
  request: Request,
  email: string,
  action = 'login',
) {
  // Only Cloudflare supplies a trusted CF-Connecting-IP. On Hostinger, retain
  // a conservative shared limit plus the independent per-account limit until
  // its verified proxy IP contract is configured. Never trust client IP headers.
  const ip =
    env.BOH_HOSTING_TARGET === 'node'
      ? 'hostinger-shared'
      : request.headers.get('cf-connecting-ip') || 'unknown-edge';
  for (const [bucket, max] of [
    [`${action}:ip:${ip}`, 60],
    [`${action}:account:${email.toLowerCase()}`, 10],
  ] as const) {
    const result = await storeCall('auth_rate_limit', {
      key: await hashToken(bucket),
      limit: max,
    });
    if (!result?.allowed)
      throw new AuthError(
        'Too many attempts. Please wait 15 minutes before trying again.',
        429,
      );
  }
}
export async function verifyPassword(email: string, password: string) {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  // The Supabase session is only credential proof. It never becomes a browser token.
  if (data.session) await client.auth.signOut({ scope: 'local' });
  return error ? null : data.user;
}
