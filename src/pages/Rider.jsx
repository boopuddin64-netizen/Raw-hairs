import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaffAuth } from '../auth/StaffAuth';
import { useTheme } from '../theme/ThemeContext';
import { supabase, supabaseConfigured, isAdmin } from '../lib/supabase';
import { BrandLogo, Chip } from '../components';

const RIDER_TRANSITIONS = { assigned: ['picked_up'], picked_up: ['in_transit'] };
const STEPS = [
  ['assigned', 'Assigned'],
  ['picked_up', 'Picked up'],
  ['in_transit', 'In transit'],
  ['delivered', 'Delivered'],
];
const DELIVERY_EVIDENCE_BUCKET = 'delivery-evidence';
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_DELIVERY_PHOTO_BYTES = 8 * 1024 * 1024;

function StatusFlow({ status }) {
  if (status === 'failed') return <div className="driver-terminal-state failed"><span aria-hidden="true">!</span><div><strong>Delivery needs attention</strong><small>Contact the owner through the existing dispatch process.</small></div></div>;
  const current = STEPS.findIndex(([key]) => key === status);
  return <ol className="driver-stepper" aria-label={`Delivery status: ${String(status).replaceAll('_', ' ')}`}>
    {STEPS.map(([key, label], index) => <li key={key} className={`${index < current ? 'complete' : ''}${index === current ? ' current' : ''}`} aria-current={index === current ? 'step' : undefined}>
      <span className="driver-step-dot">{index < current ? '✓' : index + 1}</span><span>{label}</span>
    </li>)}
  </ol>;
}

export default function Rider() {
  const { user, role, signOut } = useStaffAuth();
  const { theme, toggleTheme } = useTheme();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [otp, setOtp] = useState({ jobId: '', value: '' });
  const [photo, setPhoto] = useState({ jobId: '', file: null });
  const [notice, setNotice] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const admin = isAdmin(user);

  const refresh = useCallback(async (silent = false) => {
    if (!supabaseConfigured || !supabase) {
      setError('The driver portal is not connected to the store database.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    let query = supabase.from('rider_jobs')
      .select('id,order_id,rider_id,status,delivery_photo_path,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(50);
    if (!admin && user?.id) query = query.eq('rider_id', user.id);
    const { data, error: queryError } = await query;
    if (queryError) {
      setError('Jobs could not be loaded. Check the connection and try again.');
      setLoading(false);
      return;
    }
    setJobs(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }, [admin, user?.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 30000);
    const onFocus = () => refresh(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const updateStatus = async (job, status) => {
    setBusy(job.id); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('rider_jobs').update({ status }).eq('id', job.id);
    if (updateError) setError('That status change was rejected. Refresh the job and use its next available step.');
    else { setNotice(`Job ${job.id.slice(0, 8)} updated to ${status.replaceAll('_', ' ')}.`); await refresh(true); }
    setBusy('');
  };

  const confirmDelivery = async (jobId) => {
    if (!/^\d{6}$/.test(otp.value.trim())) { setError('Enter the customer’s six-digit delivery code.'); return; }
    setBusy(jobId); setError(''); setNotice('');
    const { data, error: rpcError } = await supabase.rpc('confirm_delivery_otp', { p_job_id: jobId, p_otp: otp.value.trim() });
    if (rpcError) setError('Delivery confirmation could not be completed. Check the connection and try again.');
    else if (!data || data.ok !== true) setError(data?.error === 'wrong_otp'
      ? 'That code was not accepted. Check the digits with the customer; repeated failures may lock the code.'
      : data?.error === 'otp_expired' || data?.error === 'otp_locked'
        ? 'The delivery code is expired or locked. Ask the owner to issue a new code.'
        : data?.error === 'invalid_state'
          ? 'Move the job to In transit before confirming delivery.'
          : 'Delivery could not be confirmed. Refresh and try again.');
    else { setNotice('Delivery confirmed. Thank you.'); setOtp({ jobId: '', value: '' }); await refresh(true); }
    setBusy('');
  };

  const uploadPhoto = async (jobId) => {
    const file = photo.file;
    if (!file) return;
    const ext = PHOTO_TYPES[file.type];
    if (!ext) { setError('Use a JPG, PNG or WebP photo.'); return; }
    if (file.size <= 0 || file.size > MAX_DELIVERY_PHOTO_BYTES) { setError('Choose a photo smaller than 8 MB.'); return; }
    setBusy(jobId); setError(''); setNotice('');
    const path = `jobs/${jobId}/evidence-${Date.now()}.${ext}`;
    try {
      const { error: uploadError } = await supabase.storage.from(DELIVERY_EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error('The photo could not be uploaded. Check your connection and try again.');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) throw new Error('Your driver session has expired. Sign in again.');
      const verifyResponse = await fetch('/api/driver/verify-delivery-photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ job_id: jobId, path }),
      });
      const verification = await verifyResponse.json().catch(() => null);
      if (!verifyResponse.ok || verification?.ok !== true) throw new Error(verification?.error || 'The photo could not be verified and was not attached.');
      const { data, error: markError } = await supabase.rpc('mark_delivery_photo', { p_job_id: jobId, p_path: path });
      if (markError || !data || data.ok !== true) throw new Error('Photo was not attached. Refresh the job and try again.');
      setNotice('Optional delivery photo attached.'); setPhoto({ jobId: '', file: null }); await refresh(true);
    } catch (uploadError) { setError(uploadError?.message || 'The photo could not be verified and attached.'); }
    finally { setBusy(''); }
  };

  if (!supabaseConfigured) return <div className="driver-app"><div className="driver-content"><h1>Driver portal</h1><div className="notice">The driver portal is not connected to the store database.</div></div></div>;

  return (
    <div className="driver-app">
      <header className="driver-topbar"><Link to="/" aria-label="Raw.hairs home"><BrandLogo /></Link><div className="driver-header-title"><span>DRIVER PORTAL</span><small>Delivery operations</small></div><div className="driver-header-actions"><button className="icon-btn" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☼' : '☾'}</button><button className="btn btn-ghost" type="button" onClick={() => signOut()}>Sign out</button></div></header>
      <main className="driver-content">
        <section className="driver-welcome"><div><p className="eyebrow">{admin ? 'ADMIN VIEW' : 'YOUR DELIVERY WORKSPACE'}</p><h1>Hello, <em>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Driver'}</em></h1><p className="muted">{admin ? 'Review job status here; assignments stay in Dispatch.' : 'One clear next step at a time.'}</p><p className="driver-user-line">{user?.email} · {role}</p></div><div className={`driver-refresh-state${error ? ' offline' : ''}`}><span className="driver-refresh-dot" /><div><strong>{error ? 'Connection needs attention' : 'Checking for updates'}</strong><small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · checks every 30 sec` : 'Waiting for database response'}</small></div><button className="btn btn-ghost" type="button" onClick={() => refresh()} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button></div></section>

        {error && <div className="driver-message error" role="alert">{error}</div>}
        {notice && <div className="driver-message success" role="status">{notice}</div>}
        {admin && <div className="driver-admin-note"><span>Admin read-only view</span><Link className="btn btn-outline" to="/admin/dispatch">Manage assignments in Dispatch</Link></div>}

        <section className="driver-jobs-section" aria-labelledby="driver-jobs-title">
          <div className="driver-section-heading"><div><p className="eyebrow">DATABASE ASSIGNMENTS</p><h2 id="driver-jobs-title">{jobs.length ? 'Your deliveries' : 'Delivery queue'}</h2></div><span className="driver-job-count">{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span></div>
          {loading && <div className="driver-empty">Loading assigned jobs…</div>}
          {!loading && jobs.length === 0 && <div className="driver-empty"><span className="driver-empty-mark">✓</span><h3>{admin ? 'No driver jobs yet.' : 'You’re all caught up.'}</h3><p className="muted">{admin ? 'New dispatch jobs will appear here.' : 'Assigned jobs will appear here when they are added to the database.'}</p></div>}
          <div className="driver-job-list">
            {jobs.map((job) => {
              const next = RIDER_TRANSITIONS[job.status] || [];
              const isAssigned = !admin && job.rider_id === user?.id;
              const nextStatus = next[0];
              return <article key={job.id} className="driver-job">
                <div className="driver-job-head"><div><p className="eyebrow">JOB {job.id.slice(0, 8).toUpperCase()}</p><h3>Order {job.order_id?.slice(0, 8) || '—'}</h3></div><Chip tone={job.status === 'delivered' ? 'ok' : job.status === 'failed' ? 'bad' : 'info'}>{String(job.status || 'assigned').replaceAll('_', ' ')}</Chip></div>
                {admin && <p className="muted small driver-assignee">Assigned driver: {job.rider_id || 'Unassigned'}</p>}
                <StatusFlow status={job.status} />
                {!admin && isAssigned && nextStatus && <div className="driver-next-action"><div><p className="eyebrow">NEXT STEP</p><strong>{nextStatus === 'picked_up' ? 'Collect the order' : 'Start the delivery'}</strong><span className="muted small">This updates the job status in the store database.</span></div><button className="btn btn-primary btn-lg" type="button" disabled={busy === job.id} onClick={() => updateStatus(job, nextStatus)}>{busy === job.id ? 'Updating…' : nextStatus === 'picked_up' ? 'Mark picked up' : 'Mark in transit'}<span aria-hidden="true"> →</span></button></div>}
                {!admin && isAssigned && job.status === 'in_transit' && <div className="driver-delivery-action"><div className="driver-action-title"><div><p className="eyebrow">FINAL STEP · EXISTING WORKFLOW</p><h3>Confirm delivery</h3><p className="muted small">Enter the six-digit code the customer shares with you. If it has expired or locked, ask the owner for a reissued code.</p></div><span className="driver-step-badge">OTP</span></div>
                  <div className="driver-otp-row"><label htmlFor={`otp-${job.id}`}>Customer delivery code</label><input id={`otp-${job.id}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp.jobId === job.id ? otp.value : ''} onChange={(event) => setOtp({ jobId: job.id, value: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="••••••" aria-describedby={`otp-help-${job.id}`} /><button className="btn btn-primary btn-lg" type="button" disabled={busy === job.id} onClick={() => confirmDelivery(job.id)}>{busy === job.id ? 'Confirming…' : 'Confirm delivered'}</button><small id={`otp-help-${job.id}`} className="muted">Delivery is marked complete only after the code is accepted.</small></div>
                  <div className="driver-photo-upload"><div><strong>Delivery photo <span className="muted">· optional</span></strong><p className="muted small">JPG, PNG or WebP · max 8 MB · verified before attachment</p></div><label className="btn btn-outline file-button" htmlFor={`photo-${job.id}`}>Choose photo<input id={`photo-${job.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto({ jobId: job.id, file: event.target.files?.[0] || null })} /></label>{photo.jobId === job.id && photo.file && <><span className="driver-photo-name">{photo.file.name}</span><button className="btn btn-ghost" type="button" disabled={busy === job.id} onClick={() => uploadPhoto(job.id)}>{busy === job.id ? 'Uploading…' : 'Upload optional photo'}</button></>}</div>
                </div>}
                {!admin && job.rider_id !== user?.id && <span className="muted small">This job is not assigned to your account.</span>}
                {!admin && isAssigned && !next.length && job.status !== 'in_transit' && <div className="driver-terminal-state"><span aria-hidden="true">✓</span><div><strong>{job.status === 'delivered' ? 'Delivery completed' : 'No further status action'}</strong><small>The job status is saved in the store database.</small></div></div>}
                {admin && job.status !== 'delivered' && <p className="muted small">For reassignment or delivery-code actions, use the validated Dispatch workspace.</p>}
              </article>;
            })}
          </div>
        </section>

        <footer className="driver-footer"><span>Status is read from the store database and refreshed about every 30 seconds while this page is open.</span><span>No live location tracking or in-portal map is enabled.</span></footer>
      </main>
    </div>
  );
}
