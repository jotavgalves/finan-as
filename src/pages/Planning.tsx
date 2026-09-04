import { useEffect, useState } from 'preact/hooks';
import { api } from '../data/api';
import { money } from '../lib/money';

export function Planning(props: { month: string }) {
  const [data, setData] = useState<any>(null);
  const [target, setTarget] = useState('');

  async function load() {
    const r = await api.planning(props.month);
    setData(r);
    setTarget(String((r.summary?.monthEndTargetCents || 0) / 100));
  }
  useEffect(() => { load().catch(() => setData(null)); }, [props.month]);

  async function saveTarget() {
    await api.setMonthlyTarget(props.month, Math.round(Number(target || 0) * 100));
    await load();
  }

  if (!data) return <div class="panel" style="padding:24px">Carregando planejamento…</div>;
  const s = data.summary;
  return <>
    <div class="grid2">
      <section class="hero">
        <div class="kicker">Quanto preciso gerar neste mês</div>
        <div class={`bigMoney ${s.additionalIncomeNeededCents > 0 ? 'expense' : 'income'}`}>{money(s.additionalIncomeNeededCents)}</div>
        <div class="muted">Dinheiro livre + receitas agendadas − despesas restantes, preservando sua meta de fim do mês.</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:20px;flex-wrap:wrap"><span class="muted">Quero terminar com</span><input class="input" inputMode="decimal" value={target} onInput={e=>setTarget((e.target as HTMLInputElement).value)} /><button class="btn primary" onClick={saveTarget}>Salvar meta</button></div>
      </section>
      <section class="stats">
        <div class="stat"><small>Dinheiro livre</small><strong>{money(s.availableNowCents)}</strong></div>
        <div class="stat"><small>Receitas agendadas</small><strong class="income">{money(s.incomeScheduledCents)}</strong></div>
        <div class="stat"><small>Ainda a pagar</small><strong class="warning">{money(s.expensesRemainingCents)}</strong></div>
        <div class="stat"><small>Saldo projetado</small><strong class={s.projectedFreeCents >= 0 ? 'income' : 'expense'}>{money(s.projectedFreeCents)}</strong></div>
      </section>
    </div>
    <div class={`risk ${s.firstCashRisk ? '' : 'good'}`}>
      <strong>{s.firstCashRisk ? `Primeiro risco de caixa: ${s.firstCashRisk.date}` : 'Fluxo de caixa coberto'}</strong>
      <p>{s.firstCashRisk ? `O caixa pode ficar em ${money(-Math.abs(s.firstCashRisk.deficitCents))} depois de ${s.firstCashRisk.after}.` : 'Nenhuma data do mês fica negativa considerando entradas já agendadas.'}</p>
    </div>
    <div class="sectionTitle"><div><h2>Contas sem cobertura</h2><p>Obrigações que podem chegar antes de haver dinheiro livre suficiente.</p></div></div>
    <div class="list">{(data.uncovered || []).length ? data.uncovered.map((x:any)=><div class="row"><div class="rowDate">{x.date}</div><div class="rowMain"><strong>{x.description}</strong><small>Valor {money(x.amountCents)}</small></div><div class="rowValue expense">faltam {money(x.gapCents)}</div></div>) : <div class="empty">Todas as contas previstas estão cobertas.</div>}</div>
  </>;
}
