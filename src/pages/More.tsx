import { useEffect, useState } from 'preact/hooks';
import type { AccountSummary, RecurringRule } from '../../shared/types';
import { api } from '../data/api';
import { money } from '../lib/money';

export function More(props: { onAdmin: () => void }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [reserves, setReserves] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.accounts(), api.recurring(), api.reserves(), api.cards()]).then(([a,r,rv,c]) => {
      setAccounts(a.accounts || []); setRules(r.rules || []); setReserves(rv.reserves || []); setCards(c.cards || []);
    }).catch(() => undefined);
  }, []);
  return <>
    <div class="sectionTitle"><div><h2>Contas financeiras</h2><p>Onde o dinheiro está fisicamente.</p></div><button class="btn" onClick={props.onAdmin}>Admin</button></div>
    <div class="cards">{accounts.map(a => <div class="miniCard" key={a.id}><small>{a.name}</small><strong>{money(a.balanceCents)}</strong><div class="muted">{money(a.freeCents)} livre · {money(a.reservedCents)} reservado</div></div>)}</div>

    <div class="sectionTitle"><div><h2>Reservas</h2><p>Para que parte do seu dinheiro está separada.</p></div></div>
    <div class="cards">{reserves.length ? reserves.map(r => <div class="miniCard" key={r.id}><small>{r.name}</small><strong>{money(r.amountCents)}</strong><div class="muted">meta {money(r.goalCents)} · {(r.allocations || []).map((a:any)=>a.accountName).join(', ') || 'sem alocação'}</div></div>) : <div class="miniCard"><small>Reservas</small><div class="muted" style="margin-top:8px">Nenhuma reserva cadastrada.</div></div>}</div>

    <div class="sectionTitle"><div><h2>Cartões</h2><p>Limites e crédito já comprometido.</p></div></div>
    <div class="cards">{cards.length ? cards.map(c => <div class="miniCard" key={c.id}><small>{c.name}</small><strong>{money(c.committedCents)}</strong><div class="muted">de {money(c.limitCents)} · fecha dia {c.closingDay} · vence dia {c.dueDay}</div></div>) : <div class="miniCard"><small>Cartões</small><div class="muted" style="margin-top:8px">Nenhum cartão cadastrado.</div></div>}</div>

    <div class="sectionTitle"><div><h2>Recorrências</h2><p>Regras de despesas e receitas fixas.</p></div></div>
    <div class="list">{rules.length ? rules.map(r => <div class="row" key={r.id}><div class="rowDate">{r.frequency}</div><div class="rowMain"><strong>{r.description}</strong><small>{r.nature === 'fixed' ? 'valor fixo' : 'valor estimado'} · início {r.startDate}</small></div><div class={`rowValue ${r.kind==='income'?'income':'expense'}`}>{money(r.amountCents)}</div></div>) : <div class="empty">Nenhuma recorrência cadastrada.</div>}</div>
  </>;
}
