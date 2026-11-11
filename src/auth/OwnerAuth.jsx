import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isOwner, supabase, supabaseConfigured } from '../lib/supabase';

const OwnerAuthContext = createContext(null);

export function OwnerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError('Unable to restore your session. Sign in again.');
      setUser(data?.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
      setAuthError(session?.user && !isOwner(session.user)
        ? 'This account has not been authorized for RAW HAIRS owner access.' : '');
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    user: user && isOwner(user) ? user : null,
    loading,
    authError,
    configured: supabaseConfigured,
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
      setAuthError('');
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!isOwner(data.user)) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorized for RAW HAIRS owner access.');
      }
      setUser(data.user);
      return data.user;
    },
    async signOut() {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      setUser(null);
    },
  }), [user, loading, authError]);

  return <OwnerAuthContext.Provider value={value}>{children}</OwnerAuthContext.Provider>;
}

export function useOwnerAuth() {
  const value = useContext(OwnerAuthContext);
  if (!value) throw new Error('useOwnerAuth must be used inside OwnerAuthProvider');
  return value;
}

export function OwnerRoute({ children }) {
  const { user, loading, configured } = useOwnerAuth();
  const location = useLocation();
  if (loading) return <div className="wrap page"><p className="muted">Checking owner access…</p></div>;
  if (!configured || !user) return <Navigate to="/owner-sign-in" replace state={{ from: location.pathname }} />;
  return children;
}

export function OwnerSignIn() {
  const { signIn, user, loading, configured, authError } = useOwnerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <div className="wrap page"><p className="muted">Checking session…</p></div>;
  if (user) return <Navigate to="/admin" replace />;
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await signIn(email, password); }
    catch (err) { setError(err?.message || 'Sign-in failed. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="wrap page auth-page">
      <div className="auth-panel">
        <p className="eyebrow">RAW HAIRS · OWNER ACCESS</p>
        <h1>Owner sign in</h1>
        <p className="muted small">This area is restricted to the authorized business owner.</p>
        {!configured && <div className="notice auth-error" role="alert">Supabase is not configured in this environment. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before enabling owner sign-in.</div>}
        {(error || authError) && <div className="notice auth-error" role="alert">{error || authError}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="owner-email">Email address</label><input id="owner-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label htmlFor="owner-password">Password</label><input id="owner-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!configured || busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
        <p className="muted small">Owner accounts are provisioned separately. Public owner registration is disabled.</p>
      </div>
    </section>
  );
}
