import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

const ROLES = ['owner','manager','operations','rider'];
const labels = { owner:'Owner', manager:'Manager', operations:'Operations', rider:'Rider' };
async function readJson(response) { const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||'Request failed.'); return data; }
export default function StaffManagement() {
  const { user } = useAuth();
  const [staff,setStaff]=useState([]), [events,setEvents]=useState([]), [email,setEmail]=useState(''), [role,setRole]=useState('rider');
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState('');
  const csrf=()=>document.cookie.split('; ').find(x=>x.startsWith('rawhairs_csrf='))?.split('=').slice(1).join('=')||'';
  const request=useCallback(async(method,body)=>readJson(await fetch('/api/admin/staff-users',{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf())},...(body?{body:JSON.stringify(body)}:{})})),[]);
  const load=useCallback(async()=>{setBusy(true);setError('');try{const data=await request('GET');setStaff(data.staff||[]);setEvents(data.events||[]);}catch(e){setError(e.message);}finally{setBusy(false);}},[request]);
  useEffect(()=>{load();},[load]);
  async function add(event){event.preventDefault();setBusy(true);setError('');setMessage('');try{await request('POST',{email,role});setEmail('');setMessage('Staff account added.');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function update(id,patch){setBusy(true);setError('');setMessage('');try{await request('PATCH',{id,...patch});setMessage('Staff access updated.');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="glass-panel adm-panel staff-access-panel">
    <div className="adm-section-title"><div><span className="adm-kicker">OWNER CONTROL</span><h2>Staff & permissions</h2><p>Add registered customer accounts, assign roles and control access.</p></div><button className="adm-button ghost" onClick={load} disabled={busy}>↻ Refresh</button></div>
    <div className="staff-access-note"><b>Signed in as:</b> {user?.email||'Owner'} · Only the Owner can manage staff access. New staff must already have a RAW HAIRS customer account.</div>
    <form className="adm-invite-form" onSubmit={add}><label htmlFor="staff-email">Add an existing account</label><div className="staff-add-grid"><input id="staff-email" className="adm-input" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Staff email address"/><select className="adm-input" value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{labels[r]}</option>)}</select><button className="adm-button primary" disabled={busy}>Add staff +</button></div></form>
    {message&&<p className="staff-success" role="status">{message}</p>}{error&&<p className="staff-error" role="alert">{error}</p>}
    <div className="adm-table-wrap"><table className="adm-table staff-table"><thead><tr><th>STAFF ID</th><th>ROLE</th><th>ACCESS</th><th>CHANGE ROLE</th><th>ACTION</th></tr></thead><tbody>{staff.map(s=><tr key={s.id}><td><b>{s.id.slice(0,8)}…</b><small>{s.firebase_uid.slice(0,9)}…</small></td><td>{labels[s.role]||s.role}</td><td>{s.is_active?'Active':'Deactivated'}</td><td><select className="adm-input" value={s.role} disabled={busy} onChange={e=>update(s.id,{role:e.target.value})}>{ROLES.map(r=><option key={r} value={r}>{labels[r]}</option>)}</select></td><td><button className="adm-button ghost" disabled={busy} onClick={()=>update(s.id,{isActive:!s.is_active})}>{s.is_active?'Deactivate':'Reactivate'}</button></td></tr>)}</tbody></table></div>
    {!staff.length&&!busy&&<p className="adm-footnote">No staff accounts found yet.</p>}
    <div className="staff-audit"><h3>Recent access changes</h3>{events.length?events.map(e=><p key={e.id}><b>{e.action.replaceAll('_',' ')}</b><small>{new Date(e.created_at).toLocaleString()} · {e.actor_role}</small></p>):<p className="adm-footnote">No access changes recorded yet.</p>}</div>
    <p className="adm-footnote">Password recovery is handled through the secure email reset flow on the sign-in page. Passwords are never viewable by administrators.</p>
  </section>;
}
