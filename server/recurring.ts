import type { Env } from './env';
import { HttpError, nowIso, uuid } from './http';
import { audit, getOrCreateCategory, getOrCreateSource } from './repository';

function parseDate(value: string) { const d = new Date(`${value}T12:00:00Z`); if (Number.isNaN(d.getTime())) throw new HttpError(400,'Data de recorrência inválida.'); return d; }
function iso(d: Date) { return d.toISOString().slice(0,10); }
function nextDate(current: Date, frequency: string) {
  const d = new Date(current);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate()+7);
  else if (frequency === 'biweekly') d.setUTCDate(d.getUTCDate()+14);
  else if (frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear()+1);
  else {
    const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate(); d.setUTCDate(Math.min(day,last));
  }
  return d;
}

export async function listRecurringRules(env: Env) {
  const result=await env.DB.prepare(`SELECT r.*,c.name category_name,s.name source_name,a.name account_name FROM recurring_rules r LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN income_sources s ON s.id=r.income_source_id LEFT JOIN accounts a ON a.id=r.account_id WHERE r.active=1 ORDER BY r.description`).all<any>();
  return (result.results||[]).map(r=>({id:r.id,kind:r.kind,description:r.description,amountCents:Number(r.amount_cents),frequency:r.frequency,nature:r.nature,startDate:r.start_date,endDate:r.end_date,active:!!r.active,categoryName:r.category_name,incomeSourceName:r.source_name,accountId:r.account_id,accountName:r.account_name,paymentMethod:r.payment_method,version:Number(r.version||1)}));
}

export async function createRecurringRule(env: Env,input:any) {
  if(!['income','expense'].includes(input.kind))throw new HttpError(400,'Tipo inválido.');
  if(!['weekly','biweekly','monthly','yearly'].includes(input.frequency))throw new HttpError(400,'Frequência inválida.');
  const amount=Number(input.amountCents);if(!Number.isInteger(amount)||amount<=0)throw new HttpError(400,'Valor inválido.');
  const start=input.startDate||input.dueDate;if(!start)throw new HttpError(400,'Data inicial obrigatória.');
  parseDate(start);
  const categoryId=input.kind==='expense'?await getOrCreateCategory(env,input.categoryName):null;
  const sourceId=input.kind==='income'?await getOrCreateSource(env,input.incomeSourceName):null;
  const id=uuid(),now=nowIso();
  await env.DB.prepare(`INSERT INTO recurring_rules (id,kind,description,amount_cents,category_id,income_source_id,account_id,payment_method,frequency,nature,start_date,end_date,active,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,1)`)
    .bind(id,input.kind,(input.description||'').trim(),amount,categoryId,sourceId,input.accountId||null,input.paymentMethod||null,input.frequency,input.nature==='estimated'?'estimated':'fixed',start,input.endDate||null,now,now).run();
  await ensureRecurringHorizon(env,id,18);
  await audit(env,'recurring.created','recurring_rule',id,null,{id,...input});
  return id;
}

export async function ensureRecurringHorizon(env: Env,ruleId:string,monthsAhead=18){
  const r=await env.DB.prepare('SELECT * FROM recurring_rules WHERE id=? AND active=1').bind(ruleId).first<any>();if(!r)return;
  let d=parseDate(r.start_date);const hardEnd=r.end_date?parseDate(r.end_date):null;const horizon=new Date();horizon.setUTCMonth(horizon.getUTCMonth()+monthsAhead);horizon.setUTCDate(horizon.getUTCDate()+7);
  const now=nowIso();const statements:any[]=[];let guard=0;
  while(d<=horizon&&(!hardEnd||d<=hardEnd)&&guard<200){
    const date=iso(d),id=uuid();
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO entries (id,kind,description,amount_cents,competence_date,due_date,category_id,income_source_id,account_id,status,payment_method,recurring_rule_id,occurrence_date,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,'planned',?,?,?,?,?,1)`)
      .bind(id,r.kind,r.description,r.amount_cents,date,date,r.category_id,r.income_source_id,r.account_id,r.payment_method,r.id,date,now,now));
    d=nextDate(d,r.frequency);guard++;
  }
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
}

export async function ensureAllRecurring(env:Env){const rules=await env.DB.prepare('SELECT id FROM recurring_rules WHERE active=1').all<any>();for(const row of rules.results||[])await ensureRecurringHorizon(env,row.id,18);}
