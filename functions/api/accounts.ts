import type { Env } from '../../server/env';
import { listAccounts, audit } from '../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try { return json({accounts:await listAccounts(env)}); }
  catch(error){return errorResponse(error);}
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body=await readJson<any>(request);const name=(body.name||'').trim();
    if(!name)throw new HttpError(400,'Nome obrigatório.');
    const balance=Number(body.openingBalanceCents||0);if(!Number.isInteger(balance))throw new HttpError(400,'Saldo inicial inválido.');
    const id=uuid(),now=nowIso();
    await env.DB.prepare('INSERT INTO accounts (id,name,type,opening_balance_cents,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)').bind(id,name,body.type||'bank',balance,now,now).run();
    await audit(env,'account.created','account',id,null,{id,name,opening_balance_cents:balance});
    return json({accounts:await listAccounts(env)},201);
  }catch(error){return errorResponse(error);}
};
