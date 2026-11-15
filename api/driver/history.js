import { requireDriver, send } from '../_lib/driver.js';
export default async function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(res,405,{error:'Method not allowed.'});}
  const auth=await requireDriver(req,res);if(!auth)return;
  const {db,user}=auth;
  const {data:jobs,error}=await db.from('rider_jobs').select('id,order_id,status,delivery_photo_path,created_at,updated_at').eq('rider_id',user.id).in('status',['delivered','failed']).order('updated_at',{ascending:false}).limit(100);
  if(error)return send(res,503,{error:'Delivery history could not be loaded.'});
  const ids=(jobs||[]).map(j=>j.order_id);
  const {data:orders,error:orderError}=ids.length?await db.from('orders').select('id,customer_name,delivery_address,delivery_city,delivery_state,total,currency').in('id',ids):{data:[],error:null};
  if(orderError)return send(res,503,{error:'Delivery history details could not be loaded.'});
  const map=new Map((orders||[]).map(o=>[o.id,o]));
  return send(res,200,{jobs:(jobs||[]).map(j=>({...j,order:map.get(j.order_id)||null}))});
}
