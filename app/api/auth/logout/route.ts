import { body, response, failure } from '@/lib/server';
import {
  sessionToken,
  hashToken,
  withSessionCookie,
} from '@/lib/password-auth';
import { storeCall } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    await body(request);
    const token = await sessionToken();
    if (token)
      await storeCall('auth_revoke_session', {
        tokenHash: await hashToken(token),
      });
    return withSessionCookie(response({ signedOut: true }), '', 0);
  } catch (e) {
    return failure(e);
  }
}
