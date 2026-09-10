import { response, failure } from '@/lib/server';
import { passwordSession, AuthError } from '@/lib/password-auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const session = await passwordSession();
    if (!session) throw new AuthError('Please sign in again.');
    return response({
      name: session.name,
      email: session.email,
      mustChangePassword: session.must_change_password || session.setup_only,
    });
  } catch (e) {
    return failure(e);
  }
}
