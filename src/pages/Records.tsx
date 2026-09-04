import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AccountSummary, Entry, EntryKind } from '../../shared/types';
import { api } from '../data/api';
import { EntryList } from '../components/EntryList';
import { money } from '../lib/money';

function bounds(period: string) {
  if (period === 'all') return { from: '2000-01-01', to: '2100-12-31' };
  if (/^\d{4}$/.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` };
  const [y,m] = period.split('-').map(Number);
  const last = new Date(y, m, 0, 12).getDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2,'0')}` };
}

export function Records(props: {
  kind: EntryKind;
  onSettle: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [period,setPeriod] = useState(month);
  const [entries,setEntries] = useState<Entry[]>([]);
  const [accounts,setAccounts] = useState<AccountSummary[]>([]);
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState<'all'|'done'|'planned'|'overdue'|'partial'>('all');
  const [account,setAccount] = useState('');
  const [label,setLabel] = useState('');
  const [payment,setPayment] = useState('');
  const range = bounds(period);

  useEffect(() => {
    Promise.all([api.entries(range.from,range.to),api.accounts()]).then(([e,a])=>{setEntries((e.entries||[]).filter((x:Entry)=>x.kind===props.kind));setAccounts(a.accounts||[])}).catch(()=>setEntries([]));
  },[period,props.kind]);

  const today = new Date().toISOString().slice(0,10);
  const labels = useMemo(()=>[...new Set(entries.map(e=>props.kind==='income'?e.incomeSourceName:e.categoryName).filter(Boolean) as string[])].sort(),[entries,props.kind]);
  const filtered = useMemo(()=>entries.filter(e=>{
    if(account&&e.accountId!==account)return false;
    if(payment&&e.paymentMethod!==payment)return false;
    const itemLabel=props.kind==='income'?e.incomeSourceName:e.categoryName;
    if(label&&itemLabel!==label)return false;
    if(status==='done'&&e.status!=='done')return false;
    if(status==='planned'&&!(e.status==='planned'&&e.dueDate>=today&&e.settledCents===0))return false;
    if(status==='overdue'&&!(e.status==='planned'&&e.dueDate<today))return false;
    if(status==='partial'&&!(e.status==='planned'&&e.settledCents>0))return false;
    const hay=`${e.description} ${e.categoryName||''} ${e.incomeSourceName||''} ${e.accountName||''} ${e.paymentMethod||''}`.toLowerCase();
    return !search||hay.includes(search.toLowerCase());
  }),[entries,account,payment,label,status,search,props.kind,today]);

  const settled=filtered.reduce((s,e)=>s+e.settledCents,0);
  const pending=filtered.filter(e=>e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const overdue=filtered.filter(e=>e.status==='planned'&&e.dueDate<today).reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const total=filtered.reduce((s,e)=>s+e.amountCents,0);
  const title=props.kind==='income'?'Receitas':'Despesas';

  function clear(){setSearch('');setStatus('all');setAccount('');setLabel('');setPayment('')}

  return <>
    <div class="toolbar">
      <input class="input" placeholder={`Buscar em ${title.toLowerCase()}…`} value={search} onInput={e=>setSearch((e.target as HTMLInputElement).value)} />
      <div class="filters">
        <select class="select" value={period} onChange={e=>setPeriod((e.target as HTMLSelectElement).value)}><option value={month}>Este mês</option><option value={String(now.getFullYear())}>Ano {now.getFullYear()}</option><option value="all">Tudo</option></select>
        <select class="select" value={status} onChange={e=>setStatus((e.target as HTMLSelectElement).value as any)}><option value="all">Todos os status</option><option value="done">{props.kind==='income'?'Recebidas':'Pagas'}</option><option value="planned">{props.kind==='income'?'A receber':'A pagar'}</option><option value="overdue">Vencidas</option><option value="partial">Parciais</option></select>
        <select class="select" value={label} onChange={e=>setLabel((e.target as HTMLSelectElement).value)}><option value="">{props.kind==='income'?'Todas as fontes':'Todas as categorias'}</option>{labels.map(x=><option value={x}>{x}</option>)}</select>
        <select class="select" value={account} onChange={e=>setAccount((e.target as HTMLSelectElement).value)}><option value="">Todas as contas</option>{accounts.map(a=><option value={a.id}>{a.name}</option>)}</select>
        <select class="select" value={payment} onChange={e=>setPayment((e.target as HTMLSelectElement).value)}><option value="">Todos os pagamentos</option><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option></select>
        <button class="btn" onClick={clear}>Limpar</button>
      </div>
    </div>
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><small>{props.kind==='income'?'Recebido':'Pago'}</small><strong class={props.kind==='income'?'income':'expense'}>{money(settled)}</strong></div>
      <div class="stat"><small>{props.kind==='income'?'A receber':'A pagar'}</small><strong class="planned">{money(pending)}</strong></div>
      <div class="stat"><small>Vencido</small><strong class="expense">{money(overdue)}</strong></div>
      <div class="stat"><small>Total filtrado</small><strong>{money(total)}</strong></div>
    </div>
    <EntryList entries={filtered} onSettle={props.onSettle} onEdit={props.onEdit} onDelete={props.onDelete}/>
  </>;
}
