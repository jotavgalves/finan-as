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
  try { await deleteEntry(env,String(params.id)); return json({ok:true}); }
  catch(error){return errorResponse(error);}
};
