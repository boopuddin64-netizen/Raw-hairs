import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Chip } from '../components';
import { supabase, supabaseConfigured } from '../lib/supabase';

const TONE = {
  awaiting_payment: 'info',
  paid: 'ok',
  pending_admin_approval: 'warn',
  processing: 'info',
  dispatched: 'warn',
  delivered: 'ok',
  cancelled: 'muted',
  refunded: 'muted',
};

export default function Account() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [trackId, setTrackId] = useState('');

  // Forgot-password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');
  const [showReset, setShowReset] = useState(false);

  const navigate = useNavigate();

  const refreshSession = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const current = data?.session?.user ?? null;
    setUser(current);
    if (current) {
      const [ordersRes, bookingsRes] = await Promise.all([
        supabase.from('orders').select('id,status,total,total_kobo,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('bookings').select('id,status,customer_name,scheduled_at,notes,created_at').order('created_at', { ascending: false }).limit(20),
      ]);
      setOrders(ordersRes.data || []);
      setBookings(bookingsRes.data || []);
    } else {
      setOrders([]);
      setBookings([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshSession();
    if (!supabase) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshSession();
    });
    return () => subscription.unsubscribe();
  }, []);

  // After sign-in/sign-up: attach past guest orders placed with the same
  // (verified) email to this account. Best-effort — never blocks sign-in.
  const claimGuestOrders = async (prefix) => {
    try {
      const { data } = await supabase.rpc('claim_guest_orders', {});
      if (data?.ok && data.claimed > 0) {
        return `${prefix} We also linked ${data.claimed} past order${data.claimed > 1 ? 's' : ''} placed with this email to your account.`;
      }
    } catch { /* best-effort */ }
    return prefix;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      if (!supabaseConfigured || !supabase) {
        throw new Error('Account services are not configured in this deployment.');
      }
      if (mode === 'signin') {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) throw signError;
        setMsg(await claimGuestOrders('Signed in successfully.'));
      } else {
        const { data, error: signError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || undefined } },
        });
        if (signError) throw signError;
        if (data.user) {
          // Best-effort profile row (RLS allows self-insert)
          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName.trim() || null,
          });
        }
        setMsg(data.session
          ? await claimGuestOrders('Account created and signed in.')
          : 'Account created. Check your email to confirm, then sign in.');
        setMode('signin');
      }
      await refreshSession();
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetMsg('');
    setResetBusy(true);
    try {
      if (!supabaseConfigured || !supabase) {
        throw new Error('Account services are not configured in this deployment.');
      }
      const trimmed = resetEmail.trim();
      if (!trimmed) throw new Error('Enter the email address on your account.');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}${window.location.pathname}#/account`,
      });
      if (resetError) throw resetError;
      setResetMsg('If that email has a RAW HAIRS account, a password-reset link is on its way. Check your inbox (and spam folder).');
      setResetEmail('');
    } catch (err) {
      setResetError(err?.message || 'Could not send the reset email.');
    } finally {
      setResetBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      if (supabase) await supabase.auth.signOut();
      setUser(null);
      setOrders([]);
      setBookings([]);
      setMsg('Signed out.');
    } catch (err) {
      setError(err?.message || 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="wrap page"><p className="muted">Loading account…</p></div>;
  }

  if (!supabaseConfigured) {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <h1>My account</h1>
        <div className="notice auth-error">Supabase is not configured in this environment.</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <p className="eyebrow">My account</p>
        <h1>Welcome back</h1>
        <p className="muted small" style={{ margin: '4px 0 16px' }}>{user.email}</p>
        <button className="btn btn-ghost" type="button" onClick={signOut} disabled={busy}>Sign out</button>
        {msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}
        {error && <div className="notice auth-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}

        <h2 style={{ fontSize: 28, margin: '28px 0 12px' }}>Your orders</h2>
        {orders.length === 0 && <p className="muted small">No orders yet.</p>}
        <div className="stack">
          {orders.map((o) => (
            <article key={o.id} className="row-card" style={{ flexDirection: 'column', gap: 8 }}>
              <div className="row-top">
                <h3><Link to={`/order/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Order {o.id.slice(0, 8)}</Link></h3>
                <Chip tone={TONE[o.status] || 'muted'}>{String(o.status).replaceAll('_', ' ')}</Chip>
              </div>
              <div className="row-top">
                <span className="muted small">{o.created_at ? new Date(o.created_at).toLocaleString('en-NG') : ''}</span>
                <span className="price">{o.total_kobo != null ? `₦${Math.round(Number(o.total_kobo) / 100).toLocaleString('en-NG')}` : (o.total != null ? `₦${Number(o.total).toLocaleString('en-NG')}` : '')}</span>
              </div>
              <Link to={`/order/${o.id}`} className="muted small" style={{ textDecoration: 'none' }}>View tracking →</Link>
            </article>
          ))}
        </div>

        <h2 style={{ fontSize: 28, margin: '28px 0 12px' }}>Your bookings</h2>
        {bookings.length === 0 && <p className="muted small">No bookings yet.</p>}
        <div className="stack">
          {bookings.map((b) => (
            <article key={b.id} className="row-card" style={{ flexDirection: 'column', gap: 6 }}>
              <div className="row-top">
                <h3>{b.customer_name}</h3>
                <Chip tone="info">{b.status}</Chip>
              </div>
              <span className="muted small">
                {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString('en-NG') : 'Not scheduled'}
              </span>
              {b.notes && <p className="muted small">{b.notes}</p>}
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <p className="eyebrow">My account</p>
      <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <p className="muted small" style={{ margin: '4px 0 16px' }}>
        Sign in to see your orders, track deliveries, and send booking and international requests.
        Orders you placed earlier with the same email are linked automatically.
      </p>

      <form onSubmit={submit} style={{ marginBottom: 24 }}>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="a-n">Display name</label>
            <input id="a-n" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="a-e">Email</label>
          <input id="a-e" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="a-p">Password</label>
          <input id="a-p" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMsg(''); }}
          >
            {mode === 'signin' ? 'Create account' : 'Already have an account?'}
          </button>
        </div>
        {mode === 'signin' && (
          <p style={{ margin: '12px 0 0' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setShowReset(!showReset); setResetMsg(''); setResetError(''); }}
            >
              Forgot your password?
            </button>
          </p>
        )}
        {msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}
        {error && <div className="notice auth-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </form>

      <div className="notice" role="status" style={{ marginBottom: 24, maxWidth: 480 }}>
        <p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Paid without an account?</p>
        <p className="muted small" style={{ marginBottom: 10 }}>
          Enter the order id from your payment confirmation to track your order and delivery.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (trackId.trim()) navigate(`/order/${trackId.trim()}`); }} style={{ display: 'flex', gap: 8 }}>
          <input id="a-t" placeholder="Order id from your confirmation" required value={trackId} onChange={(e) => setTrackId(e.target.value)} />
          <button className="btn btn-ghost" type="submit">Track</button>
        </form>
      </div>

      {showReset && (
        <form onSubmit={sendReset} className="stack" style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Reset your password</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Enter your account email and we will send you a secure link to choose a new password.
          </p>
          <div className="field">
            <label htmlFor="a-r">Account email</label>
            <input id="a-r" type="email" autoComplete="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={resetBusy}>
              {resetBusy ? 'Sending…' : 'Send reset link'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowReset(false)}>Cancel</button>
          </div>
          {resetMsg && <div className="notice" role="status">{resetMsg}</div>}
          {resetError && <div className="notice auth-error" role="alert">{resetError}</div>}
        </form>
      )}
    </div>
  );
}
