import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaffAuth } from '../auth/StaffAuth';
import { useTheme } from '../theme/ThemeContext';
import { supabase, supabaseConfigured, isAdmin } from '../lib/supabase';
import { Chip } from '../components';

const JOB_STATUSES = ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];

export default function Rider() {
  const { user, role, signOut } = useStaffAuth();
  const { theme, toggleTheme } = useTheme();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const admin = isAdmin(user);

  const refresh = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    let query = supabase
      .from('rider_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!admin && user?.id) {
      query = query.eq('rider_id', user.id);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    setJobs(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id, status) => {
    setBusy(id);
    setError('');
    const { error: updateError } = await supabase.from('rider_jobs').update({ status }).eq('id', id);
    if (updateError) setError(updateError.message);
    else await refresh();
    setBusy('');
  };

  if (!supabaseConfigured) {
    return <div className="wrap page"><h1>Driver</h1><div className="notice">Supabase is not configured.</div></div>;
  }

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <p className="eyebrow">DRIVER PORTAL</p>
      <h1>Delivery jobs</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        {admin
          ? 'Admin view — all jobs. Drivers only see jobs assigned to their user id.'
          : 'Only jobs assigned to you appear here.'}
      </p>
      <p className="muted small">{user?.email} · role: {role}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {admin && <Link className="btn btn-ghost" to="/admin">Admin portal</Link>}
        <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading}>Refresh</button>
        <button className="btn btn-ghost" type="button" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <button className="btn btn-ghost" type="button" onClick={() => signOut()}>Sign out</button>
      </div>
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {loading && <p className="muted">Loading jobs…</p>}
      {!loading && jobs.length === 0 && (
        <p className="muted small">
          {admin ? 'No driver jobs yet.' : 'No jobs assigned to you yet.'}
        </p>
      )}
      <div className="stack">
        {jobs.map((job) => (
          <article key={job.id} className="row-card" style={{ flexDirection: 'column', gap: 10 }}>
            <div className="row-top">
              <h3 style={{ fontSize: 16 }}>Job {job.id.slice(0, 8)}</h3>
              <Chip tone="info">{String(job.status).replaceAll('_', ' ')}</Chip>
            </div>
            <span className="muted small">Order: {job.order_id}</span>
            {admin && <span className="muted small">Driver: {job.rider_id || 'Unassigned'}</span>}
            <label className="small">
              Status{' '}
              <select
                value={job.status}
                disabled={busy === job.id}
                onChange={(e) => updateStatus(job.id, e.target.value)}
                style={{ minHeight: 44, marginLeft: 8 }}
              >
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}
