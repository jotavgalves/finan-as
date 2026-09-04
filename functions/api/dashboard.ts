import type { Env } from '../../server/env';
import { calculateMonth } from '../../server/planning';
import { ensureAllRecurring } from '../../server/recurring';
import { errorResponse, HttpError, json } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const month=new URL(request.url).searchParams.get('month');
    if(!month)throw new HttpError(400,'Informe o mês.');
    await ensureAllRecurring(env);
    const data=await calculateMonth(env,month);
    const today=new Date().toISOString().slice(0,10);
    const recent=data.entries.filter((e:any)=>e.status==='planned'&&e.dueDate>=today).slice(0,8);
    return json({summary:data.summary,sources:data.sources,recent});
  }catch(error){return errorResponse(error);}
};
