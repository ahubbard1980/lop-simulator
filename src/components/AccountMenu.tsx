import { useState } from 'react';
import { isSupabaseConfigured } from '../net/supabaseClient';
import { useAuthStore, type OAuthProvider } from '../net/authStore';
import { UserIcon } from './icons';

const OAUTH_PROVIDERS: { id: OAuthProvider; label: string; accent: string }[] = [
  { id: 'google', label: 'Continue with Google', accent: '#4285f4' },
  { id: 'discord', label: 'Continue with Discord', accent: '#5865f2' },
  { id: 'twitch', label: 'Continue with Twitch', accent: '#9146ff' },
];

export function AccountMenu() {
  const { user, initialized, signUpWithPassword, signInWithPassword, signInWithMagicLink, signInWithOAuth, signOut } =
    useAuthStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<'password' | 'magiclink'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isSupabaseConfigured || !initialized) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setInfo(null);
  };

  const closePanel = () => {
    setPanelOpen(false);
    resetForm();
  };

  const runAuthAction = async (action: () => Promise<{ error: string | null }>, successMessage?: string) => {
    setPending(true);
    setError(null);
    setInfo(null);
    const { error: err } = await action();
    setPending(false);
    if (err) setError(err);
    else if (successMessage) setInfo(successMessage);
    else closePanel();
  };

  if (user) {
    return (
      <div className="account-signed-in" title={user.email}>
        <UserIcon className="account-user-icon" />
        <span className="account-email">{user.email}</span>
        <button onClick={() => void signOut()}>Sign Out</button>
      </div>
    );
  }

  return (
    <div className="account-wrap">
      <button className="account-signin-btn" onClick={() => setPanelOpen((v) => !v)}>
        <UserIcon className="account-user-icon" />
        Sign In
      </button>
      {panelOpen && (
        <div className="account-panel">
          <div className="account-mode-toggle">
            <button className={mode === 'password' ? 'active' : ''} onClick={() => { setMode('password'); resetForm(); }}>
              Password
            </button>
            <button className={mode === 'magiclink' ? 'active' : ''} onClick={() => { setMode('magiclink'); resetForm(); }}>
              Magic Link
            </button>
          </div>

          <input
            className="account-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode === 'password' && (
            <input
              className="account-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {error && <div className="account-error">{error}</div>}
          {info && <div className="account-info">{info}</div>}

          {mode === 'password' ? (
            <div className="account-action-row">
              <button
                disabled={pending || !email || !password}
                onClick={() => void runAuthAction(() => signInWithPassword(email, password))}
              >
                Sign In
              </button>
              <button
                disabled={pending || !email || !password}
                onClick={() =>
                  void runAuthAction(() => signUpWithPassword(email, password), 'Account created — check your email to confirm, then sign in.')
                }
              >
                Sign Up
              </button>
            </div>
          ) : (
            <button
              className="account-action-row-single"
              disabled={pending || !email}
              onClick={() => void runAuthAction(() => signInWithMagicLink(email), 'Check your email for a sign-in link.')}
            >
              Send Magic Link
            </button>
          )}

          <div className="account-divider">or continue with</div>

          <div className="account-oauth-list">
            {OAUTH_PROVIDERS.map((p) => (
              <button
                key={p.id}
                className="account-oauth-btn"
                style={{ borderLeftColor: p.accent }}
                disabled={pending}
                onClick={() => void runAuthAction(() => signInWithOAuth(p.id))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
