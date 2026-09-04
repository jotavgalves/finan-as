import type { Env } from '../../server/env';
import { settleEntry } from '../../server/repository';
import { errorResponse, json, readJson } from '../../server/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body=await readJson<any>(request);
    return json({entry:await settleEntry(env,body.entryId,body)},201);
  }catch(error){return errorResponse(error);}
};
