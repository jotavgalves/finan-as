import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Entry } from '../../shared/types';
import { api } from '../data/api';
import { EntryList } from '../components/EntryList';
import { money } from '../lib/money';

function currentMonthRange() {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  return { from: new Date(y,m,1,12).toISOString().slice(0,10), to: new Date(y,m+1,0,12).toISOString().slice(0,10) };
}

export function Bills(props: { onSettle: (e: Entry) => void; onEdit: (e: Entry) => void; onDelete: (e: Entry) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<'all'|'payable'|'receivable'|'overdue'|'settled'>('all');
  const [search, setSearch] = useState('');
  const range = currentMonthRange();
  useEffect(() => { api.entries(range.from, range.to).then(r => setEntries(r.entries || [])).catch(() => setEntries([])); }, []);

  const today = new Date().toISOString().slice(0,10);
  const filtered = useMemo(() => entries.filter(e => {
    if (search && !`${e.description} ${e.categoryName||''} ${e.incomeSourceName||''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'payable') return e.kind === 'expense' && e.status === 'planned';
    if (tab === 'receivable') return e.kind === 'income' && e.status === 'planned';
    if (tab === 'overdue') return e.status === 'planned' && e.dueDate < today;
    if (tab === 'settled') return e.status === 'done';
    return true;
  }), [entries, tab, search]);

  const toPay = entries.filter(e=>e.kind==='expense'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const toReceive = entries.filter(e=>e.kind==='income'&&e.status==='planned').reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const overdue = entries.filter(e=>e.status==='planned'&&e.dueDate<today).reduce((s,e)=>s+Math.max(0,e.amountCents-e.settledCents),0);
  const settled = entries.filter(e=>e.status==='done').reduce((s,e)=>s+e.settledCents,0);

  return <>
    <div class="toolbar"><div class="tabs">{(['all','payable','receivable','overdue','settled'] as const).map(key => <button class={`tab ${tab===key?'active':''}`} onClick={() => setTab(key)}>{({all:'Todas',payable:'A pagar',receivable:'A receber',overdue:'Vencidas',settled:'Pagas / recebidas'} as any)[key]}</button>)}</div><input class="input" placeholder="Buscar conta…" value={search} onInput={e=>setSearch((e.target as HTMLInputElement).value)} /></div>
    <div class="stats" style="margin-bottom:14px"><div class="stat"><small>A pagar</small><strong class="expense">{money(toPay)}</strong></div><div class="stat"><small>A receber</small><strong class="income">{money(toReceive)}</strong></div><div class="stat"><small>Vencido</small><strong class="expense">{money(overdue)}</strong></div><div class="stat"><small>Liquidado</small><strong>{money(settled)}</strong></div></div>
    <EntryList entries={filtered} onSettle={props.onSettle} onEdit={props.onEdit} onDelete={props.onDelete} />
  </>;
}
