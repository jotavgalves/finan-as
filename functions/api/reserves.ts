import type { Env } from '../../server/env';
import { audit, listAccounts } from '../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../server/http';

async function listReserves(env:Env){
  const reserves=await env.DB.prepare('SELECT * FROM reserves WHERE active=1 ORDER BY name').all<any>();
  const allocations=await env.DB.prepare('SELECT ra.*,a.name account_name FROM reserve_allocations ra JOIN accounts a ON a.id=ra.account_id').all<any>();
  return (reserves.results||[]).map(r=>{const items=(allocations.results||[]).filter(a=>a.reserve_id===r.id);return{id:r.id,name:r.name,goalCents:Number(r.goal_cents),amountCents:items.reduce((s,a)=>s+Number(a.amount_cents),0),version:Number(r.version||1),allocations:items.map(a=>({id:a.id,accountId:a.account_id,accountName:a.account_name,amountCents:Number(a.amount_cents)}))}});
}

export const onRequestGet: PagesFunction<Env> = async ({env})=>{try{return json({reserves:await listReserves(env)});}catch(error){return errorResponse(error);}};

export const onRequestPost: PagesFunction<Env> = async ({request,env})=>{
  try{
    const body=await readJson<any>(request),name=(body.name||'').trim(),amount=Number(body.amountCents||0),goal=Number(body.goalCents||0);
    if(!name)throw new HttpError(400,'Nome obrigatório.');if(!Number.isInteger(amount)||amount<0||!Number.isInteger(goal)||goal<0)throw new HttpError(400,'Valor inválido.');
    const accounts=await listAccounts(env),account=accounts.find(a=>a.id===body.accountId);if(amount>0&&(!account||amount>account.freeCents))throw new HttpError(400,'Saldo livre insuficiente na conta escolhida.');
    const id=uuid(),now=nowIso(),statements:any[]=[env.DB.prepare('INSERT INTO reserves (id,name,goal_cents,active,created_at,updated_at,version) VALUES (?,?,?,1,?,?,1)').bind(id,name,goal,now,now)];
    if(amount>0)statements.push(env.DB.prepare('INSERT INTO reserve_allocations (id,reserve_id,account_id,amount_cents,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(uuid(),id,body.accountId,amount,now,now));
    await env.DB.batch(statements);await audit(env,'reserve.created','reserve',id,null,{name,goalCents:goal,amountCents:amount});return json({reserves:await listReserves(env)},201);
  }catch(error){return errorResponse(error);}
};
