import type { Env } from './env';
import { HttpError, nowIso } from './http';
import { listAccounts, listEntries, audit } from './repository';

function monthBounds(month:string){if(!/^\d{4}-\d{2}$/.test(month))throw new HttpError(400,'Mês inválido.');const [y,m]=month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0,12)).getUTCDate();return{from:`${month}-01`,to:`${month}-${String(last).padStart(2,'0')}`}}

export async function calculateMonth(env:Env,month:string){
  const {from,to}=monthBounds(month),entries=await listEntries(env,from,to),accounts=await listAccounts(env);
  const availableNowCents=accounts.reduce((s,a)=>s+a.freeCents,0),reservedCents=accounts.reduce((s,a)=>s+a.reservedCents,0);
  const sourcesResult=await env.DB.prepare('SELECT id,name,expected_monthly_cents FROM income_sources ORDER BY name').all<any>();
  const sources=(sourcesResult.results||[]).map(src=>{
    const list=entries.filter(e=>e.kind==='income'&&e.incomeSourceId===src.id);
    const received=list.reduce((s,e)=>s+e.settledCents,0),scheduled=list.filter(e=>e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
    const expected=Math.max(Number(src.expected_monthly_cents||0),received+scheduled);
    return{id:src.id,name:src.name,expectedCents:expected,receivedCents:received,scheduledCents:scheduled,unscheduledCents:Math.max(0,expected-received-scheduled)};
  });
  const incomeReceivedCents=entries.filter(e=>e.kind==='income').reduce((s,e)=>s+e.settledCents,0);
  const incomeScheduledCents=entries.filter(e=>e.kind==='income'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const incomeExpectedCents=sources.reduce((s,x)=>s+x.expectedCents,0);
  const incomeMissingCents=Math.max(0,incomeExpectedCents-incomeReceivedCents);
  const expensesPaidCents=entries.filter(e=>e.kind==='expense').reduce((s,e)=>s+e.settledCents,0);
  const expensesRemainingCents=entries.filter(e=>e.kind==='expense'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const targetRow=await env.DB.prepare('SELECT minimum_free_balance_cents FROM monthly_targets WHERE month=?').bind(month).first<any>();
  const monthEndTargetCents=Number(targetRow?.minimum_free_balance_cents??100000);
  const projectedFreeCents=availableNowCents+incomeScheduledCents-expensesRemainingCents;
  const additionalIncomeNeededCents=Math.max(0,monthEndTargetCents-projectedFreeCents);

  const currentMonth=new Date().toISOString().slice(0,7),startDate=month===currentMonth?new Date().toISOString().slice(0,10):from;
  let running=availableNowCents;let firstCashRisk:null|{date:string;deficitCents:number;after:string}=null;const uncovered:any[]=[];
  const future=entries.filter(e=>e.status==='planned'&&e.dueDate>=startDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||(a.kind==='income'?-1:1));
  for(const e of future){const outstanding=Math.max(0,e.amountCents-e.settledCents);if(e.kind==='income')running+=outstanding;else{if(running<outstanding)uncovered.push({id:e.id,description:e.description,date:e.dueDate,amountCents:outstanding,gapCents:outstanding-running});running-=outstanding;}if(running<0&&!firstCashRisk)firstCashRisk={date:e.dueDate,deficitCents:Math.abs(running),after:e.description};}

  return{summary:{availableNowCents,reservedCents,incomeReceivedCents,incomeScheduledCents,incomeExpectedCents,incomeMissingCents,expensesPaidCents,expensesRemainingCents,monthEndTargetCents,projectedFreeCents,additionalIncomeNeededCents,firstCashRisk},sources,uncovered,entries,accounts};
}

export async function setMonthlyTarget(env:Env,month:string,targetCents:number){monthBounds(month);if(!Number.isInteger(targetCents)||targetCents<0)throw new HttpError(400,'Meta inválida.');const before=await env.DB.prepare('SELECT * FROM monthly_targets WHERE month=?').bind(month).first();await env.DB.prepare(`INSERT INTO monthly_targets (month,minimum_free_balance_cents,updated_at) VALUES (?,?,?) ON CONFLICT(month) DO UPDATE SET minimum_free_balance_cents=excluded.minimum_free_balance_cents,updated_at=excluded.updated_at`).bind(month,targetCents,nowIso()).run();await audit(env,'monthly_target.updated','monthly_target',month,before,{month,minimum_free_balance_cents:targetCents});}
