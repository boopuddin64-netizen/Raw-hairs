import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);
async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [profileStatus, setProfileStatus] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  async function refresh() {
    const session = await json(await fetch('/api/auth/session', { credentials: 'same-origin' }));
    setConfigured(Boolean(session.configured));
    setGoogleEnabled(Boolean(session.googleEnabled));
    setCsrfToken(session.csrfToken || '');
    setUser(session.user || null);
    if (session.user) {
      try {
        const profile = await json(await fetch('/api/me', { credentials: 'same-origin' }));
        setCustomer(profile.customer || null);
        setProfileStatus('synced');
      } catch {
        setCustomer(null);
        setProfileStatus('error');
      }
    } else {
      setCustomer(null);
      setProfileStatus('idle');
    }
    return session.user || null;
  }

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(json)
      .then(async (session) => {
        if (!active) return;
        setConfigured(Boolean(session.configured));
        setGoogleEnabled(Boolean(session.googleEnabled));
        setCsrfToken(session.csrfToken || '');
        setUser(session.user || null);
        if (session.user) {
          try {
            const profile = await json(await fetch('/api/me', { credentials: 'same-origin' }));
            if (active) { setCustomer(profile.customer || null); setProfileStatus('synced'); }
          } catch { if (active) setProfileStatus('error'); }
        } else if (active) setProfileStatus('idle');
      })
      .catch(() => { if (active) setProfileStatus('error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function post(path, body) {
    if (!csrfToken) throw new Error('Security token is not ready. Refresh the page and try again.');
    return json(await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body || {}),
    }));
  }

  const value = {
    user, customer, profileStatus, loading, configured, googleEnabled,
    async register(email, password, displayName) {
      await post('/api/auth/register', { email, password, displayName });
      await refresh();
    },
    async login(email, password) {
      await post('/api/auth/login', { email, password });
      await refresh();
    },
    async loginWithGoogle() {
      if (!googleEnabled) throw new Error('Google sign-in is not configured for this deployment.');
      window.location.href = '/api/auth/google/start';
    },
    async resetPassword(email) {
      const result = await post('/api/auth/reset-password', { email });
      return result;
    },
    async logout() {
      await post('/api/auth/logout');
      setUser(null);
      setCustomer(null);
      setProfileStatus('idle');
      await refresh();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
