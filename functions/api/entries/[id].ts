import type { Env } from '../../../server/env';
import { deleteEntry, getEntry, updateEntry } from '../../../server/repository';
import { errorResponse, HttpError, json, readJson } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  try { const entry=await getEntry(env,String(params.id)); if(!entry)throw new HttpError(404,'Lançamento não encontrado.'); return json({entry}); }
  catch(error){return errorResponse(error);}
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, params, env }) => {
  try { const body=await readJson<any>(request); return json({entry:await updateEntry(env,String(params.id),body)}); }
  catch(error){return errorResponse(error);}
};

export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  try { const id=String(params.id),linked=await env.DB.prepare('SELECT card_installment_id FROM entries WHERE id=?').bind(id).first<any>();await deleteEntry(env,id);if(linked?.card_installment_id)await env.DB.prepare("UPDATE card_installments SET status='planned' WHERE id=?").bind(linked.card_installment_id).run();return json({ok:true}); }
  catch(error){return errorResponse(error);}
};
