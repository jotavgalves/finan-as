import type { Env } from '../../../server/env';
import { errorResponse, json } from '../../../server/http';

export const onRequestGet:PagesFunction<Env>=async({request,env})=>{try{const url=new URL(request.url),limit=Math.min(250,Math.max(10,Number(url.searchParams.get('limit')||100))),r=await env.DB.prepare('SELECT id,action,entity_type,entity_id,before_json,after_json,created_at FROM audit_log ORDER BY created_at DESC LIMIT ?').bind(limit).all<any>();return json({audit:(r.results||[]).map(x=>({id:x.id,action:x.action,entityType:x.entity_type,entityId:x.entity_id,before:x.before_json?JSON.parse(x.before_json):null,after:x.after_json?JSON.parse(x.after_json):null,createdAt:x.created_at}))});}catch(error){return errorResponse(error)}};
