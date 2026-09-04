import type { Env } from '../../../server/env';
import { calculateMonth } from '../../../server/planning';
import { ensureAllRecurring } from '../../../server/recurring';
import { errorResponse, HttpError, json } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const month=new URL(request.url).searchParams.get('month');
    if(!month)throw new HttpError(400,'Informe o mês.');
    await ensureAllRecurring(env);
    const data=await calculateMonth(env,month);
    return json({summary:data.summary,uncovered:data.uncovered,sources:data.sources});
  }catch(error){return errorResponse(error);}
};
