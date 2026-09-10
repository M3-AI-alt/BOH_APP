import { sessionToken } from '@/lib/password-auth';
import Workspace from './workspace';
import Welcome from './welcome';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const token = await sessionToken();
  if (!token && process.env.NODE_ENV !== 'development') return <Welcome />;
  return <Workspace userName="Your workspace" />;
}
