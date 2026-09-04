import type { Env } from '../../../server/env';
import { createEntry, listEntries } from '../../../server/repository';
import { createRecurringRule } from '../../../server/recurring';
import { errorResponse, HttpError, json, readJson } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url=new URL(request.url),from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if(!from||!to)throw new HttpError(400,'Informe from e to.');
    return json({entries:await listEntries(env,from,to)});
  }catch(error){return errorResponse(error);}
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body=await readJson<any>(request);
    if(body.recurring){
      const ruleId=await createRecurringRule(env,{...body,...body.recurring,startDate:body.recurring.startDate||body.dueDate});
      const entries=await listEntries(env,body.dueDate,body.dueDate);
      return json({entry:entries.find((e:any)=>e.recurringRuleId===ruleId)||null,recurringRuleId:ruleId},201);
    }
    return json({entry:await createEntry(env,body)},201);
  }catch(error){return errorResponse(error);}
};
