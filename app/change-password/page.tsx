'use client';
import { useEffect, useState } from 'react';
import { LockKeyhole, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
export default function ChangePassword() {
  const [account, setAccount] = useState<{
    name: string;
    email: string;
    mustChangePassword: boolean;
  } | null>(null);
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace('/login');
          return;
        }
        const data = (await r.json()) as {
          name: string;
          email: string;
          mustChangePassword: boolean;
          error?: string;
        };
        if (!r.ok)
          throw new Error(data.error || 'Could not load your account.');
        if (active) setAccount(data);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation, currentPassword }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok)
        throw new Error(data.error || 'Could not update your password.');
      setPassword('');
      setConfirmation('');
      setCurrentPassword('');
      try {
        window.localStorage.setItem('boh-records-changed', String(Date.now()));
      } catch {
        /* No account data is stored here. */
      }
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
      setBusy(false);
    }
  }
  return (
    <main className="password-page">
      <section className="password-card">
        <img
          src="/brand/boh-navy.svg"
          alt="Ben Oxford Hub"
          width={210}
          height={85}
        />
        <div className="password-symbol">
          <LockKeyhole size={23} />
        </div>
        <p className="eyebrow">YOUR ACCOUNT, YOUR PASSWORD</p>
        <h1>
          {account?.mustChangePassword
            ? 'Make it yours.'
            : 'Change your password.'}
        </h1>
        <p>
          {account?.mustChangePassword
            ? 'Choose a personal password before opening your workspace. Your temporary password will stop working.'
            : 'Choose a new password. Other signed-in sessions will be closed.'}
        </p>
        {account && (
          <div className="password-account">
            <strong>{account.name}</strong>
            <span>{account.email}</span>
          </div>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {!account && !error && (
          <Loader2 className="spin" aria-label="Loading account" />
        )}
        {account && (
          <form className="staff-login-form" onSubmit={submit}>
            {!account.mustChangePassword && (
              <>
                <label htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  required
                  maxLength={128}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={busy}
                />
              </>
            )}
            <label htmlFor="new-password">New password</label>
            <div className="password-input">
              <input
                id="new-password"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                required
                minLength={12}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                aria-label={visible ? 'Hide new password' : 'Show new password'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small>
              At least 12 characters. A few unrelated words make a strong
              password.
            </small>
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              required
              minLength={12}
              maxLength={128}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
            <button
              className="welcome-signin-button"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Securing your account…' : 'Save password & continue'}
              {busy ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          </form>
        )}
        <a className="password-back" href="/login">
          Back to sign in
        </a>
      </section>
    </main>
  );
}
