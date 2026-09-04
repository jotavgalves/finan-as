import type { Env } from '../../server/env';
import { audit } from '../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../server/http';

async function list(env:Env){const r=await env.DB.prepare(`SELECT c.id,c.name,c.budget_cents,COUNT(e.id) entry_count FROM categories c LEFT JOIN entries e ON e.category_id=c.id AND e.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`).all<any>();return (r.results||[]).map(x=>({id:x.id,name:x.name,budgetCents:Number(x.budget_cents||0),entryCount:Number(x.entry_count||0)}));}
export const onRequestGet:PagesFunction<Env>=async({env})=>{try{return json({categories:await list(env)});}catch(error){return errorResponse(error)}};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{try{const b=await readJson<any>(request),name=(b.name||'').trim(),budget=Number(b.budgetCents||0);if(!name)throw new HttpError(400,'Nome obrigatório.');if(!Number.isInteger(budget)||budget<0)throw new HttpError(400,'Orçamento inválido.');const id=uuid(),now=nowIso();await env.DB.prepare('INSERT INTO categories (id,name,budget_cents,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id,name,budget,now,now).run();await audit(env,'category.created','category',id,null,{id,name,budgetCents:budget});return json({categories:await list(env)},201);}catch(error){return errorResponse(error)}};
