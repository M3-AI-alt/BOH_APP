import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV !== 'development')
    return (
      <main className="gate">
        <div className="brand-mark">b.</div>
        <h1>Ben Oxford Hub</h1>
        <p>Your private centre workspace.</p>
        <a className="primary-link" href={chatGPTSignInPath('/')} target="_top">
          Sign in securely
        </a>
        <small>Access is limited to approved staff.</small>
      </main>
    );
  return <Workspace userName={user?.displayName ?? 'Director'} />;
}
