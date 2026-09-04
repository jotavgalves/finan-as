import { useEffect, useState } from 'preact/hooks';
import { api } from '../data/api';

export function Admin(props: { onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.integrity().then(setData).catch(e => setData({ error: e.message })); }, []);
  return <>
    <div class="sectionTitle"><div><h2>Painel administrativo</h2><p>Integridade, segurança e manutenção estrutural.</p></div><button class="btn" onClick={props.onBack}>Voltar</button></div>
    <div class="adminGrid">
      <section class="panel" style="padding:18px"><div class="kicker">Integridade</div>{data?.checks ? Object.entries(data.checks).map(([key,value]) => <div class="row" style="grid-template-columns:1fr auto;padding-left:0;padding-right:0"><div class="rowMain"><strong>{key}</strong></div><div class={`rowValue ${value ? 'income' : 'expense'}`}>{value ? 'OK' : 'ERRO'}</div></div>) : <div class="muted" style="margin-top:12px">{data?.error || 'Verificando…'}</div>}</section>
      <section class="panel" style="padding:18px"><div class="kicker">Segurança</div><div class="stats" style="margin-top:14px"><div class="stat"><small>Sessões ativas</small><strong>{data?.sessions ?? '—'}</strong></div><div class="stat"><small>Tentativas bloqueadas</small><strong>{data?.lockedAttempts ?? '—'}</strong></div></div><div class="muted" style="margin-top:14px">Senhas nunca são incluídas no bundle. Login e rate limit são executados nas Pages Functions.</div></section>
    </div>
  </>;
}
