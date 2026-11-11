import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, firebaseConfigured } from '../lib/firebase';

const OwnerAuthContext = createContext(null);

export function OwnerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const token = await getIdTokenResult(nextUser);
        if (token.claims.owner !== true) {
          await signOut(auth);
          setUser(null);
          setAuthError('This account has not been authorized as the RAW HAIRS owner.');
        } else {
          setUser(nextUser);
          setAuthError('');
        }
      } catch {
        setUser(null);
        setAuthError('Unable to verify owner permissions. Sign in again.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    authError,
    configured: firebaseConfigured,
    async signIn(email, password) {
      if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* environment variables.');
      setAuthError('');
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await getIdTokenResult(credential.user, true);
      if (token.claims.owner !== true) {
        await signOut(auth);
        throw new Error('This account is not authorized for owner access.');
      }
      setUser(credential.user);
      return credential.user;
    },
    async signOut() {
      if (auth) await signOut(auth);
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
  if (!configured || !user) {
    return <Navigate to="/owner-sign-in" replace state={{ from: location.pathname }} />;
  }
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
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wrap page auth-page">
      <div className="auth-panel">
        <p className="eyebrow">RAW HAIRS · OWNER ACCESS</p>
        <h1>Owner sign in</h1>
        <p className="muted small">This area is restricted to the authorized business owner.</p>
        {!configured && (
          <div className="notice auth-error" role="alert">
            Firebase is not configured in this environment. Add the four VITE_FIREBASE_* values from .env.example before enabling owner sign-in.
          </div>
        )}
        {(error || authError) && <div className="notice auth-error" role="alert">{error || authError}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="owner-email">Email address</label>
            <input id="owner-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="owner-password">Password</label>
            <input id="owner-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!configured || busy}>
            {busy ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>
        <p className="muted small">Owner accounts are provisioned separately. Public owner registration is disabled.</p>
      </div>
    </section>
  );
}
