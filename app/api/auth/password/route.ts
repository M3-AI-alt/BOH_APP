import { body, response, failure } from '@/lib/server';
import {
  passwordSession,
  sessionToken,
  hashToken,
  randomToken,
  AuthError,
  authClient,
  verifyPassword,
  limitAuth,
  withSessionCookie,
} from '@/lib/password-auth';
import { storeCall } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let started = false;
  try {
    const input = await body(request);
    const session = await passwordSession();
    if (!session) throw new AuthError('Please sign in again.');
    await limitAuth(request, session.email, 'password');
    const password = typeof input.password === 'string' ? input.password : '';
    if (
      password.length < 12 ||
      password.length > 128 ||
      password !== input.confirmation
    )
      throw new AuthError(
        'Use 12–128 characters and make both new-password fields match.',
        400,
      );
    if (!session.must_change_password && !session.setup_only) {
      const current =
        typeof input.currentPassword === 'string' ? input.currentPassword : '';
      if (
        current.length > 128 ||
        (await verifyPassword(session.email, current))?.id !==
          session.auth_user_id ||
        current === password
      )
        throw new AuthError(
          'Check your current password and choose a different new password.',
          400,
        );
    }
    // A temporary password must not remain the permanent password.
    if (
      (await verifyPassword(session.email, password))?.id ===
      session.auth_user_id
    )
      throw new AuthError(
        'Choose a new password, different from the current password.',
        400,
      );
    const ticket = randomToken(),
      token = randomToken();
    await storeCall('auth_password_begin', {
      tokenHash: await hashToken(await sessionToken()),
      version: session.credential_version,
      ticketHash: await hashToken(ticket),
    });
    started = true;
    const { error } = await authClient().auth.admin.updateUserById(
      session.auth_user_id,
      { password },
    );
    if (error)
      throw new AuthError(
        'The password change could not finish. Ask the Director to restore access before trying again.',
        503,
      );
    const result = await storeCall('auth_password_finish', {
      ticketHash: await hashToken(ticket),
      tokenHash: await hashToken(token),
    });
    return withSessionCookie(response({ next: '/' }), token, result.expiresIn);
  } catch (e) {
    // Provider and database writes cannot share a transaction: any interrupted change fails closed.
    if (started)
      return withSessionCookie(
        failure(
          new AuthError(
            'The password change needs administrator review. Your old sessions have been closed.',
            503,
          ),
        ),
        '',
        0,
      );
    return failure(e);
  }
}
