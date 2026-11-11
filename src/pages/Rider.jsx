import { useEffect, useState } from 'react';
import { useOwnerAuth } from '../auth/OwnerAuth';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { Chip } from '../components';

const JOB_STATUSES = ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];

export default function Rider() {
  const { user } = useOwnerAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('rider_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    setJobs(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const updateStatus = async (id, status) => {
    setBusy(id);
    setError('');
    const { error: updateError } = await supabase.from('rider_jobs').update({ status }).eq('id', id);
    if (updateError) setError(updateError.message);
    else await refresh();
    setBusy('');
  };

  if (!supabaseConfigured) {
    return <div className="wrap page"><h1>Rider</h1><div className="notice">Supabase is not configured.</div></div>;
  }

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Rider · owner access</p>
      <h1>Delivery jobs</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        Owner preview of rider jobs. Dedicated rider accounts come later.
      </p>
      <p className="muted small">Signed in as {user?.email}</p>
      <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading} style={{ marginBottom: 12 }}>
        Refresh
      </button>
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {loading && <p className="muted">Loading jobs…</p>}
      {!loading && jobs.length === 0 && <p className="muted small">No rider jobs yet.</p>}
      <div className="stack">
        {jobs.map((job) => (
          <article key={job.id} className="row-card" style={{ flexDirection: 'column', gap: 10 }}>
            <div className="row-top">
              <h3 style={{ fontSize: 16 }}>Job {job.id.slice(0, 8)}</h3>
              <Chip tone="info">{String(job.status).replaceAll('_', ' ')}</Chip>
            </div>
            <span className="muted small">Order: {job.order_id}</span>
            <span className="muted small">Rider: {job.rider_id || 'Unassigned'}</span>
            <label className="small">
              Status{' '}
              <select
                value={job.status}
                disabled={busy === job.id}
                onChange={(e) => updateStatus(job.id, e.target.value)}
                style={{ minHeight: 44, marginLeft: 8 }}
              >
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}
