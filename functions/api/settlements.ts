import type { Env } from '../../server/env';
import { settleEntry } from '../../server/repository';
import { errorResponse, json, readJson } from '../../server/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body=await readJson<any>(request);
    const entry=await settleEntry(env,body.entryId,body);
    const linked=await env.DB.prepare('SELECT card_installment_id FROM entries WHERE id=?').bind(body.entryId).first<any>();
    if(linked?.card_installment_id)await env.DB.prepare('UPDATE card_installments SET status=? WHERE id=?').bind(entry?.status==='done'?'paid':'posted',linked.card_installment_id).run();
    return json({entry},201);
  }catch(error){return errorResponse(error);}
};
