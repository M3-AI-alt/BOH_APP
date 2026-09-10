'use client';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
export default function SignInForm() {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await r.json()) as { error?: string; next?: string };
      if (!r.ok)
        throw new Error(data.error || 'Could not sign in. Please try again.');
      setPassword('');
      window.location.assign(
        data.next === '/change-password' ? '/change-password' : '/',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
      setBusy(false);
    }
  }
  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label htmlFor="staff-email">
        Work email <span>/ Email</span>
      </label>
      <input
        id="staff-email"
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={200}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={busy}
      />
      <label htmlFor="staff-password">
        Password <span>/ Mật khẩu</span>
      </label>
      <div className="password-input">
        <input
          id="staff-password"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button className="welcome-signin-button" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in to your workspace'}
        {busy ? (
          <Loader2 size={18} className="spin" />
        ) : (
          <ArrowRight size={18} />
        )}
      </button>
      <details className="welcome-help">
        <summary>Forgot your password?</summary>
        <p>
          Ask Karam Ben to arrange a new temporary password for your individual
          account. Never use another staff member’s login.
        </p>
      </details>
    </form>
  );
}
