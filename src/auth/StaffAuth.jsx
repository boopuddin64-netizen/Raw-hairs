import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import {
  supabase,
  supabaseConfigured,
  isDriver,
  getStaffRole,
  driverEmails,
} from '../lib/supabase';
import { adminApi } from '../lib/adminApi';

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  // Admin session lives on the server (HttpOnly cookie); this only mirrors its state.
  const [admin, setAdmin] = useState({ loading: true, ok: false, email: null, configured: true });

  useEffect(() => {
    let active = true;
    adminApi.session()
      .then((s) => active && setAdmin({ loading: false, ok: s.ok, email: s.email, configured: s.configured !== false }))
      .catch(() => active && setAdmin({ loading: false, ok: false, email: null, configured: true }));
    const onUnauthorized = () => setAdmin((a) => ({ ...a, ok: false, email: null }));
    window.addEventListener('rh-admin-unauthorized', onUnauthorized);
    return () => { active = false; window.removeEventListener('rh-admin-unauthorized', onUnauthorized); };
  }, []);

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
      const next = session?.user ?? null;
      setUser(next);
      setLoading(false);
      if (next && !getStaffRole(next)) {
        setAuthError('This account is not authorized for admin or driver access.');
      } else {
        setAuthError('');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    user,
    role: getStaffRole(user),
    loading,
    authError,
    configured: supabaseConfigured,
    admin,
    driverEmailsConfigured: driverEmails.length > 0,

    async signIn(email, password) {
      if (!supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
      }
      setAuthError('');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const role = getStaffRole(data.user);
      if (!role) {
        await supabase.auth.signOut();
        setUser(null);
        throw new Error(
          'This account is not on the driver allow-list. Add the email to VITE_DRIVER_EMAILS, or set app_metadata.role in Supabase.'
        );
      }
      setUser(data.user);
      return { user: data.user, role };
    },

    async adminSignIn(email, password) {
      const result = await adminApi.login(email, password);
      setAdmin({ loading: false, ok: true, email: result.email, configured: true });
    },

    async adminSignOut() {
      try { await adminApi.logout(); } finally {
        setAdmin((a) => ({ ...a, ok: false, email: null }));
      }
    },

    async signOut() {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      setUser(null);
    },
  }), [user, loading, authError, admin]);

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const value = useContext(StaffAuthContext);
  if (!value) throw new Error('useStaffAuth must be used inside StaffAuthProvider');
  return value;
}

export function AdminRoute({ children }) {
  const { admin } = useStaffAuth();
  const location = useLocation();
  if (admin.loading) return <div className="wrap page"><p className="muted">Checking admin access…</p></div>;
  if (!admin.ok) return <Navigate to="/admin/sign-in" replace state={{ from: location.pathname }} />;
  return children;
}

export function DriverRoute({ children }) {
  const { user, loading, configured } = useStaffAuth();
  const location = useLocation();
  if (loading) return <div className="wrap page"><p className="muted">Checking driver access…</p></div>;
  if (!configured || !isDriver(user)) {
    return <Navigate to="/driver/sign-in" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function StaffSignInForm({ portal, title, subtitle, successPath, requireRole }) {
  const {
    signIn,
    signOut,
    user,
    role,
    loading,
    configured,
    authError,
    driverEmailsConfigured,
  } = useStaffAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const from = location.state?.from;

  if (loading) return <div className="wrap page"><p className="muted">Checking session…</p></div>;

  if (user && requireRole(user)) {
    return <Navigate to={from || successPath} replace />;
  }

  if (user && role && !requireRole(user)) {
    return (
      <section className="wrap page auth-page">
        <div className="auth-panel">
          <p className="eyebrow">RAW HAIRS · {portal}</p>
          <h1>Wrong portal</h1>
          <p className="muted small">
            You are signed in as <strong>{role}</strong>. This page is for {portal.toLowerCase()} only.
          </p>
          <Link className="btn btn-primary" to={role === 'admin' ? '/admin' : '/driver'}>
            Go to your portal
          </Link>
          <button className="btn btn-ghost btn-block" type="button" style={{ marginTop: 8 }} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </section>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await signIn(email, password);
      if (!requireRole(result.user)) {
        await signOut();
        throw new Error(`This account does not have ${portal.toLowerCase()} access.`);
      }
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  }

  const allowListHint = driverEmailsConfigured
    ? `Driver allow-list is configured (${driverEmails.length} email${driverEmails.length === 1 ? '' : 's'}).`
    : 'Set VITE_DRIVER_EMAILS in the environment (comma-separated) to allow driver emails.';

  return (
    <section className="wrap page auth-page">
      <div className="auth-panel">
        <p className="eyebrow">RAW HAIRS · {portal}</p>
        <h1>{title}</h1>
        <p className="muted small">{subtitle}</p>

        {!configured && (
          <div className="notice auth-error" role="alert">
            Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to your environment.
          </div>
        )}

        {configured && (
          <div className="notice" role="status">{allowListHint}</div>
        )}

        {(error || authError) && (
          <div className="notice auth-error" role="alert">{error || authError}</div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${portal}-email`}>Email address</label>
            <input
              id={`${portal}-email`}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${portal}-password`}>Password</label>
            <input
              id={`${portal}-password`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!configured || busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted small">
          Create the user in Supabase Auth (email + password), then add that email to the matching
          environment variable. You can set <code>app_metadata.role</code> later for stronger control.
        </p>

        <p className="muted small" style={{ marginTop: 8 }}>
          <Link to="/admin/sign-in">Admin sign in</Link>
          {' · '}
          <Link to="/">Back to shop</Link>
        </p>
      </div>
    </section>
  );
}

export function AdminSignIn() {
  const { admin, adminSignIn } = useStaffAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  if (admin.loading) return <div className="wrap page"><p className="muted">Checking session…</p></div>;
  if (admin.ok) return <Navigate to={location.state?.from || '/admin'} replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminSignIn(email, password);
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wrap page auth-page">
      <div className="auth-panel">
        <p className="eyebrow">RAW HAIRS · ADMIN</p>
        <h1>Admin sign in</h1>
        <p className="muted small">Manage catalogue, orders, bookings and drivers.</p>

        {!admin.configured && (
          <div className="notice auth-error" role="alert">
            Admin login is not configured on the server yet. Set <code>ADMIN_EMAIL</code>, <code>ADMIN_PASSWORD</code>,{' '}
            <code>ADMIN_SESSION_SECRET</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in the Vercel project environment, then redeploy.
          </div>
        )}
        {error && <div className="notice auth-error" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="admin-email">Email address</label>
            <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!admin.configured || busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted small" style={{ marginTop: 8 }}>
          <Link to="/driver/sign-in">Driver sign in</Link>
          {' · '}
          <Link to="/">Back to shop</Link>
        </p>
      </div>
    </section>
  );
}

export function DriverSignIn() {
  return (
    <StaffSignInForm
      portal="DRIVER"
      title="Driver sign in"
      subtitle="View and update delivery jobs assigned to you."
      successPath="/driver"
      requireRole={isDriver}
    />
  );
}

export const OwnerAuthProvider = StaffAuthProvider;
export const useOwnerAuth = useStaffAuth;
export const OwnerRoute = AdminRoute;
export const OwnerSignIn = AdminSignIn;
