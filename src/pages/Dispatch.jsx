import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '../components';
import { naira } from '../store';

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

function friendlyDispatchError(error, fallback = 'We couldn’t complete that request. Please try again.') {
  const status = error?.status;
  if (status === 401 || status === 403) return 'Your admin session may have expired. Please sign in again.';
  if (status === 404) return 'That delivery job could not be found. Refresh the page and try again.';
  if (status === 409) return 'This delivery has changed and can’t be updated that way. Refresh and try again.';
  if (status === 429) return 'Too many attempts. Please wait a little and try again.';
  if (status >= 500 || error instanceof TypeError) return fallback;
  return error?.message && !/failed to fetch|request failed|undefined|null/i.test(error.message)
    ? error.message
    : fallback;
}

async function call(method, body) {
  let res;
  try {
    res = await fetch('/api/admin/dispatch', {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? undefined : { 'content-type': 'application/json', 'x-requested-with': 'rh-admin' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('We couldn’t connect. Check your internet connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* use a plain message below */ }
  if (!res.ok) {
    const error = new Error(data?.error || 'Request failed.');
    error.status = res.status;
    throw error;
  }
  return data;
}

function DispatchCard({ job, drivers, busyId, onAssign, onUnassign, onReissue }) {
  const unassigned = job.status === 'unassigned';
  const otpExpired = !job.otp_expires_at || new Date(job.otp_expires_at).getTime() <= Date.now();
  const otpLocked = Number(job.otp_failed_attempts) >= 5;
  const canReissueOtp = job.status === 'in_transit' && (otpExpired || otpLocked);
  return (
    <article className="row-card" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="row-top">
        <h3 style={{ fontSize: 16 }}>Job {String(job.id).slice(0, 8)}</h3>
        <Chip tone={unassigned ? 'warn' : 'info'}>{String(job.status).replaceAll('_', ' ')}</Chip>
      </div>
      {job.customer_name && <span className="muted small">Customer: {job.customer_name}</span>}
      {job.customer_phone && <a className="small" href={`tel:${job.customer_phone}`}>{job.customer_phone}</a>}
      {job.order_total != null && <span className="small">Total: {naira(job.order_total)}</span>}
      <span className="muted small">Order: {job.order_id || '—'}</span>
      {job.status === 'assigned' && job.rider_id && (
        <span className="muted small">Driver: {drivers.find((d) => d.id === job.rider_id)?.email || job.rider_id}</span>
      )}
      {job.status === 'assigned' && job.otp_expires_at && (
        <span className="muted small">Initial delivery code valid until {new Date(job.otp_expires_at).toLocaleString('en-NG')} (24 hours from assignment).</span>
      )}
      {job.status === 'in_transit' && (
        <span className="muted small">
          Delivery code: {otpLocked ? 'locked after 5 attempts' : otpExpired ? 'expired' : `valid until ${new Date(job.otp_expires_at).toLocaleString('en-NG')}`}
        </span>
      )}
      {canReissueOtp && (
        <button className="btn btn-ghost" type="button" disabled={busyId === job.id} onClick={() => onReissue(job.id)}>
          Issue a new delivery code (valid 30 minutes)
        </button>
      )}
      {unassigned && (
        <select aria-label="Assign a driver" value="" disabled={busyId === job.id}
          onChange={(e) => { if (e.target.value) onAssign(job.id, e.target.value); }}
          style={{ minHeight: 44 }}>
          <option value="">Assign to driver…</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.email}</option>)}
        </select>
      )}
      {job.status === 'assigned' && (
        <button className="btn btn-ghost" type="button" disabled={busyId === job.id} onClick={() => onUnassign(job.id)}>Unassign</button>
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
  const [exceptions, setExceptions] = useState([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionBusy, setExceptionBusy] = useState('');
  const [exceptionNotes, setExceptionNotes] = useState({});

  const refresh = useCallback(async () => {
    try {
      const data = await call('GET');
      setJobs(data.jobs || []);
      setDrivers(data.drivers || []);
      setError('');
    } catch (err) {
      setError(friendlyDispatchError(err, 'We couldn’t load delivery information. Please refresh and try again.'));
    } finally {
      setLoading(false);
    }
  }, []);


  const refreshExceptions = useCallback(async () => {
    setExceptionsLoading(true);
    try {
      const response = await fetch('/api/admin/delivery-exceptions?status=pending', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not load exceptions.');
      setExceptions(data.exceptions || []);
    } catch (err) {
      setError(friendlyDispatchError(err, 'Delivery exceptions could not be loaded.'));
    } finally { setExceptionsLoading(false); }
  }, []);

  const actionException = async (exceptionId, op) => {
    const resolution = String(exceptionNotes[exceptionId] || '').trim();
    if (!resolution) { setError('Enter a resolution note before actioning this exception.'); return; }
    setExceptionBusy(exceptionId); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/delivery-exceptions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'rh-admin' },
        body: JSON.stringify({ op, exceptionId, resolution }),
      });
      const data = await response.json();
      if (!response.ok) { const err = new Error(data?.error || 'Could not update exception.'); err.status = response.status; throw err; }
      setNotice(op === 'resolve' ? 'Exception resolved.' : 'Exception dismissed.');
      setExceptionNotes((current) => ({ ...current, [exceptionId]: '' }));
      await refreshExceptions();
    } catch (err) { setError(friendlyDispatchError(err)); }
    finally { setExceptionBusy(''); }
  };

  useEffect(() => { refresh(); refreshExceptions(); }, [refresh, refreshExceptions]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const assign = async (jobId, riderId) => {
    setBusyId(jobId); setError(''); setNotice('');
    try {
      const result = await call('POST', { op: 'assign', jobId, riderId });
      setNotice(`Assigned. One-time customer delivery code: ${result.otp}. Share it with the customer; it expires in 24 hours.`);
      await refresh();
    } catch (err) { setError(friendlyDispatchError(err)); await refresh(); }
    finally { setBusyId(''); }
  };

  const unassign = async (jobId) => {
    setBusyId(jobId); setError(''); setNotice('');
    try { await call('POST', { op: 'unassign', jobId }); setNotice('Job returned to the unassigned queue.'); await refresh(); }
    catch (err) { setError(friendlyDispatchError(err)); await refresh(); }
    finally { setBusyId(''); }
  };

  const reissueOtp = async (jobId) => {
    setBusyId(jobId); setError(''); setNotice('');
    try {
      const result = await call('POST', { op: 'reissue-otp', jobId });
      setNotice(`New one-time customer delivery code: ${result.otp}. Share it with the customer; it expires in 30 minutes.`);
      await refresh();
    } catch (err) { setError(friendlyDispatchError(err)); await refresh(); }
    finally { setBusyId(''); }
  };

  const unassigned = jobs.filter((j) => j.status === 'unassigned');
  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const done = jobs.filter((j) => !['unassigned', ...ACTIVE_STATUSES].includes(j.status));

  return (
    <div className="wrap page spatial" style={{ maxWidth: 960 }}>
      <p className="eyebrow">ADMIN · DISPATCH</p>
      <h1>Delivery dispatch</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>Assign orders to drivers. Unassigned jobs wait on the left; active runs on the right.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Link className="btn btn-ghost" to="/admin">Admin portal</Link>
        <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading && <p className="muted">Loading dispatch board…</p>}
      {!loading && !error && drivers.length === 0 && (
        <div className="notice" role="status">No drivers are available yet. Add a driver account to enable delivery assignments.</div>
      )}
      {!error && <div className="dash-grid-2">
        <div className="dash-panel">
          <div className="dash-panel-head"><h2>Unassigned ({unassigned.length})</h2></div>
          <div className="stack">
            {unassigned.map((job) => <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} onReissue={reissueOtp} />)}
            {!unassigned.length && <p className="muted small">Nothing waiting. All jobs have drivers.</p>}
          </div>
        </div>
        <div className="dash-panel">
          <div className="dash-panel-head"><h2>Active runs ({active.length})</h2></div>
          <div className="stack">
            {active.map((job) => <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} onReissue={reissueOtp} />)}
            {!active.length && <p className="muted small">No active runs right now.</p>}
          </div>
        </div>
      </div>}

      <div className="dash-panel" style={{ marginTop: 16 }}>
        <div className="dash-panel-head"><h2>Delivery exceptions ({exceptions.length})</h2><button className="btn btn-ghost" type="button" onClick={refreshExceptions} disabled={exceptionsLoading}>Refresh</button></div>
        {exceptionsLoading && <p className="muted small">Loading exceptions…</p>}
        {!exceptionsLoading && exceptions.length === 0 && <p className="muted small">No pending delivery exceptions.</p>}
        <div className="stack">
          {exceptions.map((item) => (
            <article className="row-card" key={item.id} style={{ flexDirection: 'column', gap: 8 }}>
              <div className="row-top"><strong>{String(item.reason || 'other').replaceAll('_', ' ')}</strong><Chip tone="warn">Pending</Chip></div>
              <span className="muted small">Job {String(item.job_id).slice(0, 8)} · Reported {new Date(item.created_at).toLocaleString('en-NG')}</span>
              {item.job?.order?.customer_name && <span className="small">Customer: {item.job.order.customer_name}</span>}
              {item.job?.order?.customer_phone && <span className="small">Phone: {item.job.order.customer_phone}</span>}
              {item.job?.order?.delivery_address && <span className="small">Address: {item.job.order.delivery_address}</span>}
              {item.notes && <p className="small">{item.notes}</p>}
              <textarea aria-label="Resolution note" maxLength={1000} rows={3} value={exceptionNotes[item.id] || ''} onChange={(event) => setExceptionNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Required resolution / dismissal note" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" type="button" disabled={exceptionBusy === item.id} onClick={() => actionException(item.id, 'resolve')}>Resolve</button>
                <button className="btn btn-ghost" type="button" disabled={exceptionBusy === item.id} onClick={() => actionException(item.id, 'dismiss')}>Dismiss</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {done.length > 0 && !error && (
        <div className="dash-panel" style={{ marginTop: 16 }}>
          <div className="dash-panel-head"><h2>Completed / failed ({done.length})</h2></div>
          <div className="stack">
            {done.map((job) => <DispatchCard key={job.id} job={job} drivers={drivers} busyId={busyId} onAssign={assign} onUnassign={unassign} onReissue={reissueOtp} />)}
          </div>
        </div>
      )}
    </div>
  );
}
