import { requireDriver, send } from '../_lib/driver.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(res,405,{error:'Method not allowed.'}); }
  const auth = await requireDriver(req,res); if (!auth) return;
  const { db, user } = auth;
  const { data: jobs, error } = await db.from('rider_jobs')
    .select('id,order_id,rider_id,status,delivery_photo_path,created_at,updated_at')
    .eq('rider_id',user.id).order('created_at',{ascending:false}).limit(100);
  if (error) return send(res,503,{error:'Your assigned deliveries could not be loaded.'});
  const ids = (jobs || []).map(j=>j.order_id);
  const { data: orders, error: orderError } = ids.length
    ? await db.from('orders').select('id,customer_name,customer_phone,delivery_address,delivery_city,delivery_state,delivery_instructions,total,currency,status').in('id',ids)
    : {data:[],error:null};
  if (orderError) return send(res,503,{error:'Delivery details could not be loaded.'});
  const orderMap = new Map((orders||[]).map(o=>[o.id,o]));
  return send(res,200,{jobs:(jobs||[]).map(j=>({...j,order:orderMap.get(j.order_id)||null}))});
}
