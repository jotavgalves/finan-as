import type { Env } from '../../../server/env';
import { requireSession } from '../../../server/auth';
import { errorResponse, HttpError, json, readJson } from '../../../server/http';

export const onRequestGet:PagesFunction<Env>=async({request,env})=>{try{const current=await requireSession(request,env),r=await env.DB.prepare('SELECT id,expires_at,created_at,last_seen_at FROM sessions WHERE expires_at>? ORDER BY last_seen_at DESC').bind(new Date().toISOString()).all<any>();return json({sessions:(r.results||[]).map(x=>({id:x.id,expiresAt:x.expires_at,createdAt:x.created_at,lastSeenAt:x.last_seen_at,current:x.id===current.id}))});}catch(error){return errorResponse(error)}};
export const onRequestDelete:PagesFunction<Env>=async({request,env})=>{try{const current=await requireSession(request,env),b=await readJson<any>(request),id=String(b.id||'');if(!id)throw new HttpError(400,'Sessão obrigatória.');if(id===current.id)throw new HttpError(409,'Use Sair para encerrar a sessão atual.');await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();return json({ok:true});}catch(error){return errorResponse(error)}};
