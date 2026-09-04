import type { Env } from '../../../server/env';
import { setMonthlyTarget } from '../../../server/planning';
import { errorResponse, json, readJson } from '../../../server/http';

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body=await readJson<{month:string;targetCents:number}>(request);
    await setMonthlyTarget(env,body.month,Number(body.targetCents));
    return json({ok:true});
  }catch(error){return errorResponse(error);}
};
