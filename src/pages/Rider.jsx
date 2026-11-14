import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaffAuth } from '../auth/StaffAuth';
import { useTheme } from '../theme/ThemeContext';
import { supabase, supabaseConfigured, isAdmin } from '../lib/supabase';
import { Chip } from '../components';

/**
 * Server-enforced forward transitions for riders:
 * assigned -> picked_up -> in_transit -> delivered
 * Delivery itself is confirmed with the customer's OTP (confirm_delivery_otp),
 * not a plain status button.
 */
const RIDER_TRANSITIONS = {
  unassigned: [], // only admin can assign
  assigned: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: [], // OTP confirmation, not a plain button
  delivered: [],
  failed: [],
};

const DELIVERY_EVIDENCE_BUCKET = 'delivery-evidence';
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_DELIVERY_PHOTO_BYTES = 8 * 1024 * 1024;

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
  const admin = isAdmin(user);

  const refresh = async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    let query = supabase.from('rider_jobs')
      .select('id,order_id,rider_id,status,delivery_photo_path,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(50);
    if (!admin && user?.id) {
      query = query.eq('rider_id', user.id);
    }
    const { data, error: queryError } = await query;
    if (queryError) {
      setError('Jobs could not be loaded. Check your connection and try again.');
      setLoading(false);
      return;
    }
    setJobs(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh: poll every 30s while the portal is open and visible,
  // and refresh immediately when the tab regains focus, so new
  // assignments/status changes appear without tapping Refresh.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id, status) => {
    setBusy(id);
    setError('');
    setNotice('');
    const { error: updateError } = await supabase.from('rider_jobs').update({ status }).eq('id', id);
    if (updateError) {
      setError('That status change was rejected. Use the next available step for your assigned job.');
    } else {
      await refresh();
    }
    setBusy('');
  };

  const confirmDelivery = async (jobId) => {
    if (!/^\d{6}$/.test(otp.value.trim())) {
      setError('Enter the 6-digit code the customer gave you.');
      return;
    }
    setBusy(jobId);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('confirm_delivery_otp', {
      p_job_id: jobId,
      p_otp: otp.value.trim(),
    });
    if (rpcError) {
      setError('Delivery confirmation could not be completed. Check your connection and try again.');
    } else if (!data || data.ok !== true) {
      setError(data?.error === 'wrong_otp'
        ? 'That code is not correct. Ask the customer for the code on their order.'
        : data?.error === 'otp_expired' || data?.error === 'otp_locked'
          ? 'This delivery code has expired or is locked. Ask the owner to issue a new code.'
          : data?.error === 'invalid_state'
            ? 'This job is not in transit yet.'
            : 'Delivery could not be confirmed.');
    } else {
      setNotice('Delivery confirmed. Thank you!');
      setOtp({ jobId: '', value: '' });
      await refresh();
    }
    setBusy('');
  };

  const uploadPhoto = async (jobId) => {
    const file = photo.file;
    if (!file) return;
    const ext = PHOTO_TYPES[file.type];
    if (!ext) {
      setError('Use a JPG, PNG or WebP photo.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_DELIVERY_PHOTO_BYTES) {
      setError('Choose a photo smaller than 8 MB.');
      return;
    }
    setBusy(jobId);
    setError('');
    const path = `jobs/${jobId}/evidence-${Date.now()}.${ext}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from(DELIVERY_EVIDENCE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error('The photo could not be uploaded. Check your connection and try again.');

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) throw new Error('Your driver session has expired. Sign in again.');
      const verifyResponse = await fetch('/api/driver/verify-delivery-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ job_id: jobId, path }),
      });
      const verification = await verifyResponse.json().catch(() => null);
      if (!verifyResponse.ok || verification?.ok !== true) {
        throw new Error(verification?.error || 'The photo could not be verified and was not attached.');
      }

      const { data, error: markError } = await supabase.rpc('mark_delivery_photo', { p_job_id: jobId, p_path: path });
      if (markError || !data || data.ok !== true) {
        throw new Error('Photo was not attached. Confirm the job is still assigned to you and try again.');
      }
      setNotice('Delivery photo attached.');
      setPhoto({ jobId: '', file: null });
      await refresh();
    } catch (uploadError) {
      setError(uploadError?.message || 'The photo could not be uploaded or verified. It was not attached to the job.');
    } finally {
      setBusy('');
    }
  };

  if (!supabaseConfigured) {
    return <div className="wrap page"><h1>Driver</h1><div className="notice">Supabase is not configured.</div></div>;
  }

  return (
    <div className="wrap page spatial" style={{ maxWidth: 640 }}>
      <p className="eyebrow">DRIVER PORTAL</p>
      <h1>Delivery jobs</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        {admin
          ? 'Admin view — all jobs. Drivers only see jobs assigned to their user id.'
          : 'Only jobs assigned to you appear here. Jobs update automatically.'}
      </p>
      <p className="muted small">{user?.email} · role: {role}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {admin && <Link className="btn btn-ghost" to="/admin">Admin portal</Link>}
        <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading}>Refresh</button>
        <button className="btn btn-ghost" type="button" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <button className="btn btn-ghost" type="button" onClick={() => signOut()}>Sign out</button>
      </div>
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading && <p className="muted">Loading jobs…</p>}
      {!loading && jobs.length === 0 && (
        <p className="muted small">
          {admin ? 'No driver jobs yet.' : 'No jobs assigned to you yet.'}
        </p>
      )}
      <div className="stack">
        {jobs.map((job) => {
          const next = RIDER_TRANSITIONS[job.status] || [];
          const canUpdate = !admin && job.rider_id === user?.id && next.length > 0;
          return (
            <article key={job.id} className="row-card" style={{ flexDirection: 'column', gap: 10 }}>
              <div className="row-top">
                <h3 style={{ fontSize: 16 }}>Job {job.id.slice(0, 8)}</h3>
                <Chip tone="info">{String(job.status).replaceAll('_', ' ')}</Chip>
              </div>
              <span className="muted small">Order: {job.order_id}</span>
              {admin && <span className="muted small">Driver: {job.rider_id || 'Unassigned'}</span>}
              {admin && <Link className="btn btn-ghost" to="/admin/dispatch">Manage assignment in Dispatch</Link>}
              {!admin && next.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {next.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn btn-primary"
                      disabled={busy === job.id}
                      onClick={() => updateStatus(job.id, s)}
                    >
                      Mark {s.replaceAll('_', ' ')}
                    </button>
                  ))}
                </div>
              )}
              {!admin && job.status === 'in_transit' && job.rider_id === user?.id && (
                <div className="stack" style={{ gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 12 }}>
                  <strong style={{ fontSize: 14 }}>Confirm delivery</strong>
                  <div className="field">
                    <label htmlFor={`otp-${job.id}`}>6-digit code from the customer</label>
                    <input
                      id={`otp-${job.id}`}
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={otp.jobId === job.id ? otp.value : ''}
                      onChange={(e) => setOtp({ jobId: job.id, value: e.target.value })}
                      placeholder="000000"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy === job.id}
                    onClick={() => confirmDelivery(job.id)}
                  >
                    {busy === job.id ? 'Confirming…' : 'Confirm delivery'}
                  </button>
                  <div className="field">
                    <label htmlFor={`photo-${job.id}`}>Delivery photo (optional evidence)</label>
                    <input
                      id={`photo-${job.id}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setPhoto({ jobId: job.id, file: e.target.files?.[0] || null })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy === job.id || !(photo.jobId === job.id && photo.file)}
                    onClick={() => uploadPhoto(job.id)}
                  >
                    Upload photo
                  </button>
                </div>
              )}
              {!admin && !canUpdate && (
                <span className="muted small">
                  {job.rider_id !== user?.id
                    ? 'Not assigned to you.'
                    : 'No further updates available for this job.'}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
