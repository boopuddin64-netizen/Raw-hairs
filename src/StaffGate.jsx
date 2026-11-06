import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function StaffGate({ roles, children }) {
  const { user, loading } = useAuth();
  const [access, setAccess] = useState({ status: 'idle', role: null });

  useEffect(() => {
    let active = true;
    if (!user) {
      setAccess({ status: 'signed-out', role: null });
      return () => { active = false; };
    }
    setAccess({ status: 'checking', role: null });
    user.getIdToken().then((token) => fetch('/api/staff/me', {
      headers: { Authorization: `Bearer ${token}` },
    })).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Staff access could not be verified.');
      if (active) setAccess({ status: 'verified', role: payload.role });
    }).catch((error) => {
      if (active) setAccess({ status: 'denied', role: null, message: error.message });
    });
    return () => { active = false; };
  }, [user]);

  if (loading || access.status === 'idle' || access.status === 'checking') {
    return <main className="wrap page"><p role="status">Verifying staff access…</p></main>;
  }
  if (access.status === 'signed-out') {
    return <main className="wrap page"><h1>Staff sign-in required</h1><p className="muted">Sign in with an approved RAW HAIRS staff account to continue.</p><Link className="btn btn-primary" to="/account">Go to sign in</Link></main>;
  }
  if (access.status !== 'verified' || !roles.includes(access.role)) {
    return <main className="wrap page"><h1>Access restricted</h1><p className="muted">{access.message || 'Your staff role does not have permission to open this workspace.'}</p><Link to="/" className="btn btn-outline">Return to store</Link></main>;
  }
  return <>{children}<div className="staff-demo-notice" role="note">Staff role verified: <b>{access.role}</b>. This dashboard is still a development demo; live order and dispatch actions are not connected yet.</div></>;
}
