import { body, response, failure } from '@/lib/server';
import {
  AuthError,
  hashToken,
  randomToken,
  limitAuth,
  verifyPassword,
  withSessionCookie,
} from '@/lib/password-auth';
import { storeCall } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const input = await body(request);
    const email =
      typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 200 ||
      !password ||
      password.length > 128
    )
      throw new AuthError('Enter your staff email and password.', 400);
    await limitAuth(request, email);
    const before = await storeCall('auth_login_state', { email });
    const user = await verifyPassword(email, password);
    if (
      !user ||
      !before?.active ||
      before.auth_user_id !== user.id ||
      before.password_change_pending
    )
      throw new AuthError(
        'The email or password is incorrect, or staff access is unavailable.',
      );
    const token = randomToken();
    const session = await storeCall('auth_create_session', {
      authUserId: user.id,
      version: before.credential_version,
      passwordFingerprint: before.password_fingerprint,
      tokenHash: await hashToken(token),
    });
    return withSessionCookie(
      response({ next: session.mustChangePassword ? '/change-password' : '/' }),
      token,
      session.expiresIn,
    );
  } catch (e) {
    return failure(e);
  }
}
