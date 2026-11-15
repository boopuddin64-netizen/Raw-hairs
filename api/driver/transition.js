import { requireDriver, send } from '../_lib/driver.js';
import { isSameOriginRequest, readJsonBody } from '../_lib/request.js';

const NEXT = { assigned:'picked_up', picked_up:'in_transit' };
export default async function handler(req,res) {
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return send(res,405,{error:'Method not allowed.'}); }
  if (!isSameOriginRequest(req)) return send(res,403,{error:'Request rejected.'});
  let body; try { body=readJsonBody(req,{maxBytes:4096}); } catch(e) { return send(res,e.status||400,{error:e.message}); }
  const auth=await requireDriver(req,res); if(!auth)return;
  const {db,user}=auth, {job_id,status}=body;
  if(typeof job_id!=='string'||!['picked_up','in_transit'].includes(status)) return send(res,400,{error:'Invalid delivery transition.'});
  const {data:job,error:readError}=await db.from('rider_jobs').select('id,rider_id,status').eq('id',job_id).maybeSingle();
  if(readError)return send(res,503,{error:'The delivery could not be checked.'});
  if(!job||job.rider_id!==user.id)return send(res,404,{error:'Assigned delivery not found.'});
  if(NEXT[job.status]!==status)return send(res,409,{error:'This is not the next permitted delivery step.'});
  const {data,error}=await db.from('rider_jobs').update({status,updated_at:new Date().toISOString()}).eq('id',job_id).eq('rider_id',user.id).eq('status',job.status).select('id,status').maybeSingle();
  if(error||!data)return send(res,409,{error:'The delivery status changed or could not be saved. Refresh and try again.'});
  return send(res,200,{ok:true,job:data});
}
