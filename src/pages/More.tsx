import { useEffect, useState } from 'preact/hooks';
import type { AccountSummary, RecurringRule } from '../../shared/types';
import { api } from '../data/api';
import { money } from '../lib/money';

export function More(props: { onAdmin: () => void }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  useEffect(() => {
    Promise.all([api.accounts(), api.recurring()]).then(([a,r]) => { setAccounts(a.accounts || []); setRules(r.rules || []); }).catch(() => undefined);
  }, []);
  return <>
    <div class="sectionTitle"><div><h2>Contas financeiras</h2><p>Onde o dinheiro está fisicamente.</p></div><button class="btn" onClick={props.onAdmin}>Admin</button></div>
    <div class="cards">{accounts.map(a => <div class="miniCard" key={a.id}><small>{a.name}</small><strong>{money(a.balanceCents)}</strong><div class="muted">{money(a.freeCents)} livre · {money(a.reservedCents)} reservado</div></div>)}</div>
    <div class="sectionTitle"><div><h2>Recorrências</h2><p>Regras de despesas e receitas fixas.</p></div></div>
    <div class="list">{rules.length ? rules.map(r => <div class="row" key={r.id}><div class="rowDate">{r.frequency}</div><div class="rowMain"><strong>{r.description}</strong><small>{r.nature === 'fixed' ? 'valor fixo' : 'valor estimado'} · início {r.startDate}</small></div><div class={`rowValue ${r.kind==='income'?'income':'expense'}`}>{money(r.amountCents)}</div></div>) : <div class="empty">Nenhuma recorrência cadastrada.</div>}</div>
  </>;
}
