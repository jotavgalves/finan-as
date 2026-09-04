import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Entry } from '../../shared/types';
import { api } from '../data/api';
import { EntryList } from '../components/EntryList';
import { money } from '../lib/money';

type Scale = 'day'|'week'|'month'|'year'|'custom';
type GroupBy = 'date'|'category'|'account'|'payment';
type StatusFilter = 'all'|'done'|'planned'|'overdue'|'partial';

const pad=(n:number)=>String(n).padStart(2,'0');
const localIso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const clone=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);
const addDays=(d:Date,n:number)=>{const x=clone(d);x.setDate(x.getDate()+n);return x};
function startWeek(d:Date){const x=clone(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return x}
function rangeFor(scale:Scale,anchor:Date,customStart:string,customEnd:string){
  if(scale==='day'){const d=clone(anchor);return{start:d,end:d}}
  if(scale==='week'){const start=startWeek(anchor);return{start,end:addDays(start,6)}}
  if(scale==='month')return{start:new Date(anchor.getFullYear(),anchor.getMonth(),1,12),end:new Date(anchor.getFullYear(),anchor.getMonth()+1,0,12)};
  if(scale==='year')return{start:new Date(anchor.getFullYear(),0,1,12),end:new Date(anchor.getFullYear(),11,31,12)};
  const start=new Date(`${customStart}T12:00:00`),end=new Date(`${customEnd}T12:00:00`);return start<=end?{start,end}:{start:end,end:start};
}
function labelFor(scale:Scale,start:Date,end:Date){
  if(scale==='day')return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(start);
  if(scale==='week')return `${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(start)} — ${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(end)}`;
  if(scale==='month')return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(start);
  if(scale==='year')return String(start.getFullYear());
  return `${localIso(start)} — ${localIso(end)}`;
}
function shifted(scale:Scale,anchor:Date,dir:number){
  if(scale==='day')return addDays(anchor,dir);
  if(scale==='week')return addDays(anchor,dir*7);
  if(scale==='month')return new Date(anchor.getFullYear(),anchor.getMonth()+dir,1,12);
  if(scale==='year')return new Date(anchor.getFullYear()+dir,0,1,12);
  return anchor;
}
function previousRange(scale:Scale,start:Date,end:Date){
  const days=Math.round((end.getTime()-start.getTime())/86400000)+1;
  const prevEnd=addDays(start,-1),prevStart=addDays(prevEnd,-days+1);return{start:prevStart,end:prevEnd};
}
function totalOf(list:Entry[],kind:'income'|'expense'){return list.filter(e=>e.kind===kind).reduce((s,e)=>s+e.amountCents,0)}
function delta(current:number,previous:number){if(!previous)return current?100:0;return((current-previous)/Math.abs(previous))*100}

function Chart(props:{entries:Entry[];scale:Scale;start:Date;end:Date;onDrill:(date:Date,next:Scale)=>void}){
  const buckets=useMemo(()=>{
    const out:Array<{label:string;start:Date;end:Date;income:number;expense:number;next?:Scale}>=[];
    if(props.scale==='year'){
      for(let m=0;m<12;m++){const start=new Date(props.start.getFullYear(),m,1,12),end=new Date(props.start.getFullYear(),m+1,0,12);out.push({label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(start).replace('.','').toUpperCase(),start,end,income:0,expense:0,next:'month'})}
    }else if(props.scale==='month'){
      for(let d=1;d<=props.end.getDate();d++){const start=new Date(props.start.getFullYear(),props.start.getMonth(),d,12);out.push({label:String(d),start,end:start,income:0,expense:0,next:'day'})}
    }else if(props.scale==='week'){
      for(let i=0;i<7;i++){const start=addDays(props.start,i);out.push({label:new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(start).slice(0,3).toUpperCase(),start,end:start,income:0,expense:0,next:'day'})}
    }else if(props.scale==='day'){
      out.push({label:'DIA',start:props.start,end:props.end,income:0,expense:0});
    }else{
      const days=Math.max(1,Math.round((props.end.getTime()-props.start.getTime())/86400000)+1),step=Math.max(1,Math.ceil(days/16));
      for(let i=0;i<days;i+=step){const start=addDays(props.start,i),end=addDays(props.start,Math.min(days-1,i+step-1));out.push({label:new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(start).replace('.',''),start,end,income:0,expense:0,next:step===1?'day':undefined})}
    }
    props.entries.forEach(entry=>{const d=new Date(`${entry.dueDate}T12:00:00`);const bucket=out.find(b=>d>=b.start&&d<=b.end);if(bucket)bucket[entry.kind]+=entry.amountCents});
    return out;
  },[props.entries,props.scale,props.start.getTime(),props.end.getTime()]);
  const max=Math.max(1,...buckets.flatMap(b=>[b.income,b.expense]));
  return <div class="flowChart">{buckets.map((b,i)=><button class="flowBucket" key={`${b.label}-${i}`} onClick={()=>b.next&&props.onDrill(b.start,b.next)} disabled={!b.next}><div class="flowBars"><i class="flowBar incomeBar" style={{height:`${Math.max(b.income?4:0,b.income/max*100)}%`}}/><i class="flowBar expenseBar" style={{height:`${Math.max(b.expense?4:0,b.expense/max*100)}%`}}/></div><span>{b.label}</span></button>)}</div>;
}

export function Flow(props:{onSettle:(e:Entry)=>void;onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void}){
  const today=clone(new Date());
  const [scale,setScale]=useState<Scale>('month');
  const [anchor,setAnchor]=useState(today);
  const [customStart,setCustomStart]=useState(localIso(new Date(today.getFullYear(),today.getMonth(),1,12)));
  const [customEnd,setCustomEnd]=useState(localIso(new Date(today.getFullYear(),today.getMonth()+1,0,12)));
  const [entries,setEntries]=useState<Entry[]>([]);
  const [previous,setPrevious]=useState<Entry[]>([]);
  const [compare,setCompare]=useState(false);
  const [kind,setKind]=useState<'all'|'income'|'expense'>('all');
  const [status,setStatus]=useState<StatusFilter>('all');
  const [search,setSearch]=useState('');
  const [account,setAccount]=useState('');
  const [payment,setPayment]=useState('');
  const [label,setLabel]=useState('');
  const [groupBy,setGroupBy]=useState<GroupBy>('date');
  const range=rangeFor(scale,anchor,customStart,customEnd);
  const rangeKey=`${localIso(range.start)}:${localIso(range.end)}`;

  useEffect(()=>{
    api.entries(localIso(range.start),localIso(range.end)).then(r=>setEntries(r.entries||[])).catch(()=>setEntries([]));
  },[rangeKey]);
  useEffect(()=>{
    if(!compare){setPrevious([]);return}
    const p=previousRange(scale,range.start,range.end);api.entries(localIso(p.start),localIso(p.end)).then(r=>setPrevious(r.entries||[])).catch(()=>setPrevious([]));
  },[compare,rangeKey,scale]);

  const todayIso=localIso(today);
  const labels=useMemo(()=>[...new Set(entries.map(e=>e.categoryName||e.incomeSourceName).filter(Boolean) as string[])].sort(),[entries]);
  const accounts=useMemo(()=>[...new Map(entries.filter(e=>e.accountId).map(e=>[e.accountId!,e.accountName||e.accountId!])).entries()], [entries]);
  const filtered=useMemo(()=>entries.filter(e=>{
    if(kind!=='all'&&e.kind!==kind)return false;
    if(status==='done'&&e.status!=='done')return false;
    if(status==='planned'&&!(e.status==='planned'&&e.settledCents===0&&e.dueDate>=todayIso))return false;
    if(status==='overdue'&&!(e.status==='planned'&&e.dueDate<todayIso))return false;
    if(status==='partial'&&!(e.status==='planned'&&e.settledCents>0))return false;
    if(account&&e.accountId!==account)return false;
    if(payment&&e.paymentMethod!==payment)return false;
    if(label&&(e.categoryName||e.incomeSourceName)!==label)return false;
    const hay=`${e.description} ${e.categoryName||''} ${e.incomeSourceName||''} ${e.accountName||''} ${e.paymentMethod||''}`.toLowerCase();return !search||hay.includes(search.toLowerCase());
  }),[entries,kind,status,account,payment,label,search,todayIso]);
  const income=totalOf(filtered,'income'),expense=totalOf(filtered,'expense');
  const previousIncome=totalOf(previous,'income'),previousExpense=totalOf(previous,'expense');
  const plannedIn=filtered.filter(e=>e.kind==='income'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const plannedOut=filtered.filter(e=>e.kind==='expense'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);

  const groups=useMemo(()=>{
    const map=new Map<string,Entry[]>();
    filtered.forEach(e=>{const key=groupBy==='date'?e.dueDate:groupBy==='category'?(e.categoryName||e.incomeSourceName||'Sem categoria'):groupBy==='account'?(e.accountName||'Sem conta'):(e.paymentMethod||'Sem forma');map.set(key,[...(map.get(key)||[]),e])});
    return [...map.entries()].sort((a,b)=>groupBy==='date'?b[0].localeCompare(a[0]):a[0].localeCompare(b[0],'pt-BR'));
  },[filtered,groupBy]);

  function clear(){setKind('all');setStatus('all');setSearch('');setAccount('');setPayment('');setLabel('')}
  function drill(date:Date,next:Scale){setAnchor(date);setScale(next)}

  return <>
    <div class="flowToolbar">
      <div class="flowScales">{(['day','week','month','year','custom'] as Scale[]).map(x=><button class={`tab ${scale===x?'active':''}`} onClick={()=>setScale(x)}>{({day:'Dia',week:'Semana',month:'Mês',year:'Ano',custom:'Personalizado'} as any)[x]}</button>)}</div>
      <div class="flowPeriod"><button class="tab" disabled={scale==='custom'} onClick={()=>setAnchor(shifted(scale,anchor,-1))}>‹</button><strong>{labelFor(scale,range.start,range.end)}</strong><button class="tab" disabled={scale==='custom'} onClick={()=>setAnchor(shifted(scale,anchor,1))}>›</button></div>
      {scale==='custom'&&<div class="flowCustom"><input class="input" type="date" value={customStart} onInput={e=>setCustomStart((e.target as HTMLInputElement).value)}/><span>até</span><input class="input" type="date" value={customEnd} onInput={e=>setCustomEnd((e.target as HTMLInputElement).value)}/></div>}
      <div class="flowFilterGrid">
        <input class="input" placeholder="Buscar no fluxo…" value={search} onInput={e=>setSearch((e.target as HTMLInputElement).value)}/>
        <select class="select" value={kind} onChange={e=>setKind((e.target as HTMLSelectElement).value as any)}><option value="all">Receitas + despesas</option><option value="income">Receitas</option><option value="expense">Despesas</option></select>
        <select class="select" value={status} onChange={e=>setStatus((e.target as HTMLSelectElement).value as StatusFilter)}><option value="all">Todos os status</option><option value="done">Realizados</option><option value="planned">Previstos</option><option value="overdue">Vencidos</option><option value="partial">Parciais</option></select>
        <select class="select" value={label} onChange={e=>setLabel((e.target as HTMLSelectElement).value)}><option value="">Todas as categorias/fontes</option>{labels.map(x=><option>{x}</option>)}</select>
        <select class="select" value={account} onChange={e=>setAccount((e.target as HTMLSelectElement).value)}><option value="">Todas as contas</option>{accounts.map(([id,name])=><option value={id}>{name}</option>)}</select>
        <select class="select" value={payment} onChange={e=>setPayment((e.target as HTMLSelectElement).value)}><option value="">Todos os pagamentos</option><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option></select>
        <select class="select" value={groupBy} onChange={e=>setGroupBy((e.target as HTMLSelectElement).value as GroupBy)}><option value="date">Agrupar por data</option><option value="category">Agrupar por categoria/fonte</option><option value="account">Agrupar por conta</option><option value="payment">Agrupar por pagamento</option></select>
        <button class={`btn ${compare?'primary':''}`} onClick={()=>setCompare(x=>!x)}>Comparar</button><button class="btn" onClick={clear}>Limpar</button>
      </div>
    </div>

    <div class="flowSummary">
      <div class="stat"><small>Entradas</small><strong class="income">{money(income)}</strong></div><div class="stat"><small>Saídas</small><strong class="expense">{money(expense)}</strong></div><div class="stat"><small>Resultado</small><strong class={income-expense>=0?'income':'expense'}>{money(income-expense)}</strong></div><div class="stat"><small>A receber</small><strong class="planned">{money(plannedIn)}</strong></div><div class="stat"><small>A pagar</small><strong class="warning">{money(plannedOut)}</strong></div>
    </div>
    {compare&&<div class="compareStrip"><div><small>Entradas vs. período anterior</small><strong class={delta(income,previousIncome)>=0?'income':'expense'}>{delta(income,previousIncome)>=0?'+':''}{delta(income,previousIncome).toFixed(1)}%</strong></div><div><small>Saídas vs. período anterior</small><strong class={delta(expense,previousExpense)<=0?'income':'expense'}>{delta(expense,previousExpense)>=0?'+':''}{delta(expense,previousExpense).toFixed(1)}%</strong></div><div><small>Resultado atual</small><strong>{money(income-expense)}</strong></div></div>}

    <section class="panel flowChartPanel"><div class="sectionTitle" style={{margin:'0 0 12px'}}><div><h2>Movimento do período</h2><p>Clique em um mês ou dia para aprofundar a escala.</p></div><div class="flowLegend"><span><i class="legendIncome"/>entradas</span><span><i class="legendExpense"/>saídas</span></div></div><Chart entries={filtered} scale={scale} start={range.start} end={range.end} onDrill={drill}/></section>

    <div class="sectionTitle"><div><h2>Detalhamento</h2><p>{filtered.length} movimentação(ões), agrupadas por {({date:'data',category:'categoria/fonte',account:'conta',payment:'pagamento'} as any)[groupBy]}.</p></div></div>
    <div class="flowGroups">{groups.length?groups.map(([key,list])=>{const gi=totalOf(list,'income'),ge=totalOf(list,'expense');return <section class="flowGroup" key={key}><header><strong>{groupBy==='date'?new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(`${key}T12:00:00`)):key}</strong><span class={gi-ge>=0?'income':'expense'}>{money(gi-ge)}</span></header><EntryList entries={list} onSettle={props.onSettle} onEdit={props.onEdit} onDelete={props.onDelete}/></section>}) : <div class="list"><div class="empty">Nenhuma movimentação encontrada com estes filtros.</div></div>}</div>
  </>;
}
