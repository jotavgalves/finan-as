import { useEffect, useState } from 'preact/hooks';
import type { DashboardSummary, Entry } from '../../shared/types';
import { api } from '../data/api';
import { money } from '../lib/money';
import { EntryList } from '../components/EntryList';

export function Dashboard(props: { month: string; onNew: (kind: 'income'|'expense') => void; onOpenPlanning: () => void }) {
  const [data, setData] = useState<{ summary: DashboardSummary; recent: Entry[]; sources: any[] } | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try { setData(await api.dashboard(props.month)); setError(''); }
    catch (e: any) { setError(e.message || 'Falha ao carregar.'); }
  }
  useEffect(() => { load(); }, [props.month]);

  if (!data) return <div class="panel" style="padding:24px">{error || 'Carregando posição financeira…'}</div>;
  const s = data.summary;
  return <>
    <div class="grid2">
      <section class="hero">
        <div class="kicker">Dinheiro livre agora</div>
        <div class="bigMoney">{money(s.availableNowCents)}</div>
        <div class="muted">{money(s.reservedCents)} já têm destino em reservas.</div>
        <div style="display:flex;gap:8px;margin-top:22px;flex-wrap:wrap"><button class="btn primary" onClick={() => props.onNew('expense')}>Nova despesa</button><button class="btn" onClick={() => props.onNew('income')}>Nova receita</button></div>
        <div class={`risk ${s.firstCashRisk ? '' : 'good'}`}>
          <strong>{s.firstCashRisk ? `Risco de caixa em ${s.firstCashRisk.date}` : 'Nenhum buraco de caixa detectado'}</strong>
          <p>{s.firstCashRisk ? `O fluxo pode chegar a ${money(-Math.abs(s.firstCashRisk.deficitCents))} após ${s.firstCashRisk.after}.` : 'Com dinheiro livre e entradas agendadas, as contas previstas do mês ficam cobertas.'}</p>
        </div>
      </section>
      <section class="stats">
        <div class="stat"><small>Falta entrar</small><strong class="planned">{money(s.incomeMissingCents)}</strong></div>
        <div class="stat"><small>Ainda a pagar</small><strong class="warning">{money(s.expensesRemainingCents)}</strong></div>
        <div class="stat"><small>Precisa gerar</small><strong class={s.additionalIncomeNeededCents > 0 ? 'expense' : 'income'}>{money(s.additionalIncomeNeededCents)}</strong></div>
        <div class="stat"><small>Fim do mês</small><strong class={s.projectedFreeCents >= 0 ? 'income' : 'expense'}>{money(s.projectedFreeCents)}</strong></div>
      </section>
    </div>

    <div class="sectionTitle"><div><h2>Salários e receitas esperadas</h2><p>Esperado, recebido, agendado e ainda sem previsão.</p></div><button class="btn" onClick={props.onOpenPlanning}>Planejar</button></div>
    <div class="cards">
      {(data.sources || []).map(source => <div class="miniCard" key={source.id}><small>{source.name}</small><strong>{money(source.receivedCents)}</strong><div class="muted">de {money(source.expectedCents)} · {money(source.scheduledCents)} agendado · {money(source.unscheduledCents)} sem data</div></div>)}
    </div>

    <div class="sectionTitle"><div><h2>Próximos movimentos</h2><p>O que ainda altera seu caixa.</p></div></div>
    <EntryList entries={data.recent || []} />
  </>;
}
