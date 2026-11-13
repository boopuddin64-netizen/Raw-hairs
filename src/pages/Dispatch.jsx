import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '../components';
import { naira } from '../store';

/**
 * Dispatch console — the two-queue pattern from mature delivery platforms:
 * unassigned jobs on one side, assigned + in-progress on the other.
 * Admin picks a driver from the dropdown (validated server-side) and the
 * job moves queues instantly. Drivers see new assignments via the Rider
 * portal's 30s auto-refresh (merged in PR #27).
 */

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

async function call(method, body) {
  const res = await fetch('/api/admin/dispatch', {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json', 'x-requested-with': 'rh-admin' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data;
}

function DispatchCard({ job, drivers, busyId, onAssign, onUnassign }) {
  const unassigned = job.status === 'unassigned';
  return (
    <article className="row-card" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="row-top">
        <h3 style={{ fontSize: 16 }}>Job {String(job.id).slice(0, 8)}</h3>
        <Chip tone={unassigned ? 'warn' : 'info'}>{String(job.status).replaceAll('_', ' ')}</Chip>
      </div>
      {job.customer_name && <span className="muted small">Customer: {job.customer_name}</span>}
      {job.customer_phone && (
        <a className="small" href={`tel:${job.customer_phone}`}>{job.customer_phone}</a>
      )}
      {job.order_total != null && <span className="small">Total: {naira(job.order_total)}</span>}
      <span className="muted small">Order: {job.order_id || '—'}</span>
      {job.status === 'assigned' && job.rider_id && (
        <span className="muted small">Driver: {drivers.find((d) => d.id === job.rider_id)?.email || job.rider_id}</span>
      )}
      {unassigned && (
        <select
          aria-label="Assign a driver"
          value=""
          disabled={busyId === job.id}
          onChange={(e) => { if (e.target.value) onAssign(job.id, e.target.value); }}
          style={{ minHeight: 44 }}
        >
          <option value="">Assign to driver…</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.email}</option>
          ))}
        </select>
      )}
      {job.status === 'assigned' && (
        <button className="btn btn-ghost" type="button" disabled={busyId === job.id} onClick={() => onUnassign(job.id)}>
          Unassign
        </button>
      )}
      {ACTIVE_STATUSES.includes(job.status) && job.status !== 'assigned' && (
        <span className="muted small">In progress — no reassign once picked up.</span>
      )}
    </article>
  );
}

export default function Dispatch() {
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await call('GET');
      setJobs(data.jobs || []);
      setDrivers(data.drivers || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep queues fresh: poll every 30s while visible + instant refresh on focus
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const assign = async (jobId, riderId) => {
    setBusyId(jobId);
    setError('');
    setNotice('');
    try {
      await call('POST', { op: 'assign', jobId, riderId });
      setNotice('Assigned. The driver will see it in their portal within 30 seconds.');
      await refresh();
    } catch (err) {
      setError(err.message);
      await refresh(); // show the true current state after a race
    } finally {
      setBusyId('');
    }
  };

  const unassign = async (jobId) => {
    setBusyId(jobId);
    setError('');
    setNotice('');
    try {
      await call('POST', { op: 'unassign', jobId });
      setNotice('Job returned to the unassigned queue.');
      await refresh();
    } catch (err) {
      setError(err.message);
      await refresh();
    } finally {
      setBusyId('');
    }
  };

  const unassigned = jobs.filter((j) => j.status === 'unassigned');
  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const done = jobs.filter((j) => !['unassigned', ...ACTIVE_STATUSES].includes(j.status));

  return (
    <div className="wrap page spatial" style={{ maxWidth: 960 }}>
      <p className="eyebrow">ADMIN · DISPATCH</p>
      <h1>Delivery dispatch</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        Assign orders to drivers. Unassigned jobs wait on the left; active runs on the right.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Link className="btn btn-ghost" to="/admin">Admin portal</Link>
        <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading && <p className="muted">Loading dispatch board…</p>}

      {!loading && drivers.length === 0 && (
        <div className="notice" role="status">
          No drivers found. Create driver users in Supabase Auth and add their emails to VITE_DRIVER_EMAILS
          (or set app_metadata.role = 'driver').
        </div>
      )}

      <div className="dash-grid-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2>Unassigned ({unassigned.length})</h2>
          </div>
          <div className="stack">
            {unassigned.map((job) => (
              <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} />
            ))}
            {!unassigned.length && <p className="muted small">Nothing waiting. All jobs have drivers.</p>}
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2>Active runs ({active.length})</h2>
          </div>
          <div className="stack">
            {active.map((job) => (
              <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} />
            ))}
            {!active.length && <p className="muted small">No active runs right now.</p>}
          </div>
        </div>
      </div>

      {done.length > 0 && (
        <div className="dash-panel" style={{ marginTop: 16 }}>
          <div className="dash-panel-head">
            <h2>Completed / failed ({done.length})</h2>
          </div>
          <div className="stack">
            {done.map((job) => (
              <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
