import type { Env } from '../../server/env';
import { createRecurringRule, listRecurringRules } from '../../server/recurring';
import { errorResponse, json, readJson } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try { return json({rules:await listRecurringRules(env)}); }
  catch(error){return errorResponse(error);}
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try { const body=await readJson<any>(request);const id=await createRecurringRule(env,body);return json({id,rules:await listRecurringRules(env)},201); }
  catch(error){return errorResponse(error);}
};
