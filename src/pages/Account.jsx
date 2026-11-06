import { useState } from 'react';
import { useAuth } from '../AuthContext';

function authMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use': 'An account already exists with this email. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/weak-password': 'Use a stronger password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication.',
    'auth/popup-blocked': 'The sign-in window was blocked. Allow redirects and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/redirect-cancelled-by-user': 'Google sign-in was cancelled. Try again.',
    'auth/redirect-operation-pending': 'A Google sign-in is already in progress. Wait a moment and try again.',
    'auth/unauthorized-continue-uri': 'The Google sign-in return address is not authorized in Firebase.',
  };
  return messages[code] || 'We could not complete that request. Please try again.';
}

export default function Account() {
  const { user, customer, profileStatus, loading, configured, redirectError, register, login, loginWithGoogle, resetPassword, logout } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (action) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      if (mode === 'reset') setMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="wrap page" style={{ maxWidth: 640 }}><p className="eyebrow">My account</p><h1>Loading account…</h1></div>;

  if (user) {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <p className="eyebrow">My account</p>
        <h1>Welcome{user.displayName ? `, ${user.displayName}` : ''}</h1>
        <p className="muted small" style={{ margin: '8px 0 20px' }}>{user.email}</p>
        <div className="notice" style={{ marginBottom: 16 }}>
          {profileStatus === 'syncing' && 'Securing your account profile…'}{profileStatus === 'synced' && 'Your customer profile is securely connected.'}{profileStatus === 'error' && 'You are signed in, but we could not sync your customer profile. Please refresh this page or try again later.'}{profileStatus === 'idle' && 'You are signed in. Your account is being checked.'}
        </div>
        {customer?.id && <p className="muted small">Customer account connected · {customer.email || user.email}</p>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(logout)}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="wrap page" style={{ maxWidth: 520 }}>
      <p className="eyebrow">RAW HAIRS account</p>
      <h1>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}</h1>
      <p className="muted small" style={{ margin: '8px 0 20px' }}>
        {mode === 'register' ? 'Create an account to make checkout and order tracking easier.' : mode === 'reset' ? 'Enter the email address linked to your account.' : 'Sign in to access your customer account.'}
      </p>

      {!configured && <div className="notice" role="status" style={{ marginBottom: 16 }}>Firebase configuration is not yet set for this deployment. Sign-in will become available after the Vercel environment variables are added.</div>}
      {redirectError && <div className="notice" role="alert" style={{ marginBottom: 16 }}>Google sign-in could not finish: {authMessage({ code: redirectError })} <span className="small">({redirectError})</span></div>}

      <form onSubmit={(event) => {
        event.preventDefault();
        if (mode === 'register') run(() => register(email, password, name));
        else if (mode === 'reset') run(() => resetPassword(email));
        else run(() => login(email, password));
      }}>
        {mode === 'register' && <div className="field"><label htmlFor="account-name">Full name</label><input id="account-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
        <div className="field"><label htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        {mode !== 'reset' && <div className="field"><label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !configured}>{busy ? 'PLEASE WAIT…' : mode === 'register' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'SEND RESET EMAIL' : 'SIGN IN'}</button>
      </form>

      {mode !== 'reset' && <>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} disabled={busy || !configured} onClick={() => run(loginWithGoogle)}>CONTINUE WITH GOOGLE</button>
        {mode === 'login' && <button className="link-btn" style={{ width: '100%', background: 'none', border: 0, color: 'var(--pink)', cursor: 'pointer' }} onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button>}
      </>}

      {message && <div className="notice" role="status" style={{ marginTop: 14 }}>{message}</div>}

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 22, paddingTop: 18, textAlign: 'center' }}>
        {mode === 'login' ? <p className="muted small">New to RAW HAIRS? <button className="link-btn" style={{ display: 'inline-flex', border: 0, background: 'none', color: 'var(--pink)', cursor: 'pointer' }} onClick={() => { setMode('register'); setMessage(''); }}>Create an account</button></p> :
          <button className="link-btn" style={{ width: '100%', border: 0, background: 'none', color: 'var(--pink)', cursor: 'pointer' }} onClick={() => { setMode('login'); setMessage(''); }}>Back to sign in</button>}
      </div>
    </div>
  );
}
