import { requireDriver, send } from '../_lib/driver.js';
import { isSameOriginRequest, readJsonBody } from '../_lib/request.js';
const REASONS=['customer_unavailable','customer_refused','incorrect_address','unable_to_contact','reschedule_requested','other'];
export default async function handler(req,res) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Method not allowed.'});}
  if(!isSameOriginRequest(req))return send(res,403,{error:'Request rejected.'});
  let body;try{body=readJsonBody(req,{maxBytes:4096});}catch(e){return send(res,e.status||400,{error:e.message});}
  const auth=await requireDriver(req,res);if(!auth)return;
  const {job_id,reason,notes}=body;
  if(typeof job_id!=='string'||!REASONS.includes(reason)||typeof notes!=='undefined'&&(typeof notes!=='string'||notes.length>1000))return send(res,400,{error:'Provide a valid issue reason and notes.'});
  const {db,user}=auth;
  const {data:job,error}=await db.from('rider_jobs').select('id,rider_id,status').eq('id',job_id).maybeSingle();
  if(error)return send(res,503,{error:'The delivery could not be checked.'});
  if(!job||job.rider_id!==user.id||!['assigned','picked_up','in_transit'].includes(job.status))return send(res,409,{error:'This delivery cannot accept an issue report.'});
  const {data,error:insertError}=await db.from('delivery_exceptions').insert({job_id,driver_id:user.id,reason,notes:(notes||'').trim()||null,status:'pending'}).select('id').single();
  if(insertError)return send(res,503,{error:'The issue report could not be saved.'});
  return send(res,201,{ok:true,exception_id:data.id});
}
