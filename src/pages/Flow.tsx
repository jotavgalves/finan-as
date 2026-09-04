import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Entry } from '../../shared/types';
import { api } from '../data/api';
import { EntryList } from '../components/EntryList';
import { money } from '../lib/money';

function monthRange(anchor: Date) {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const start = new Date(y, m, 1, 12), end = new Date(y, m + 1, 0, 12);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end), label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(start) };
}

export function Flow(props: { onSettle: (e: Entry) => void; onEdit: (e: Entry) => void; onDelete: (e: Entry) => void }) {
  const [anchor, setAnchor] = useState(new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<'all'|'income'|'expense'>('all');
  const [status, setStatus] = useState<'all'|'planned'|'done'>('all');
  const [search, setSearch] = useState('');
  const range = monthRange(anchor);

  async function load() { const r = await api.entries(range.from, range.to); setEntries(r.entries || []); }
  useEffect(() => { load().catch(() => setEntries([])); }, [range.from, range.to]);

  const filtered = useMemo(() => entries.filter(e => {
    if (kind !== 'all' && e.kind !== kind) return false;
    if (status !== 'all' && e.status !== status) return false;
    const hay = `${e.description} ${e.categoryName || ''} ${e.incomeSourceName || ''} ${e.accountName || ''}`.toLowerCase();
    return !search || hay.includes(search.toLowerCase());
  }), [entries, kind, status, search]);
  const income = filtered.filter(e => e.kind === 'income').reduce((s,e) => s + e.amountCents, 0);
  const expense = filtered.filter(e => e.kind === 'expense').reduce((s,e) => s + e.amountCents, 0);

  return <>
    <div class="toolbar">
      <div class="tabs"><button class="tab" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()-1, 1))}>‹</button><button class="tab active">{range.label}</button><button class="tab" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()+1, 1))}>›</button></div>
      <input class="input" placeholder="Buscar no fluxo…" value={search} onInput={e => setSearch((e.target as HTMLInputElement).value)} />
    </div>
    <div class="toolbar">
      <div class="filters"><button class={`tab ${kind==='all'?'active':''}`} onClick={() => setKind('all')}>Tudo</button><button class={`tab ${kind==='income'?'active':''}`} onClick={() => setKind('income')}>Receitas</button><button class={`tab ${kind==='expense'?'active':''}`} onClick={() => setKind('expense')}>Despesas</button></div>
      <div class="filters"><button class={`tab ${status==='all'?'active':''}`} onClick={() => setStatus('all')}>Todos</button><button class={`tab ${status==='done'?'active':''}`} onClick={() => setStatus('done')}>Realizados</button><button class={`tab ${status==='planned'?'active':''}`} onClick={() => setStatus('planned')}>Previstos</button></div>
    </div>
    <div class="stats" style="margin-bottom:14px"><div class="stat"><small>Entradas</small><strong class="income">{money(income)}</strong></div><div class="stat"><small>Saídas</small><strong class="expense">{money(expense)}</strong></div><div class="stat"><small>Resultado</small><strong class={income-expense>=0?'income':'expense'}>{money(income-expense)}</strong></div><div class="stat"><small>Movimentos</small><strong>{filtered.length}</strong></div></div>
    <EntryList entries={filtered} onSettle={props.onSettle} onEdit={props.onEdit} onDelete={props.onDelete} />
  </>;
}
