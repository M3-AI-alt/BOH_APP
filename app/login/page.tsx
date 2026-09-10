import { passwordSession } from '@/lib/password-auth';
import Welcome from '../welcome';
export const dynamic = 'force-dynamic';
export default async function Login() {
  const session = await passwordSession();
  return (
    <Welcome
      signedIn={
        !!session && !session.must_change_password && !session.setup_only
      }
    />
  );
}
