import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Entry, EntryKind } from '../../shared/types';
import { ApiHttpError, api } from '../data/api';
import { flushOutbox, getOutboxCount } from '../data/offline';
import { Dashboard } from '../pages/Dashboard';
import { Flow } from '../pages/Flow';
import { Bills } from '../pages/Bills';
import { Planning } from '../pages/Planning';
import { Records } from '../pages/Records';
import { More } from '../pages/More';
import { Admin } from '../pages/Admin';
import { EntryModal } from '../components/EntryModal';
import { SettlementModal } from '../components/SettlementModal';

declare global { interface Window { turnstile?: { render: (selector: string, options: any) => string; reset: () => void } } }

type Page = 'home'|'flow'|'bills'|'planning'|'more'|'income'|'expenses'|'admin';
const ALL_PAGES: Page[] = ['home','flow','bills','planning','more','income','expenses','admin'];

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function initialPage(): Page {
  const p = new URLSearchParams(location.search).get('page') as Page | null;
  return p && ALL_PAGES.includes(p) ? p : 'home';
}

function Login(props: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    const render = () => window.turnstile?.render('#turnstile', { sitekey: siteKey, callback: (value: string) => setToken(value), theme: 'dark' });
    if (window.turnstile) return void render();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.onload = render;
    document.head.appendChild(script);
  }, [siteKey]);

  async function submit(e: Event) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.login(password, token || undefined); props.onSuccess(); }
    catch (err) {
      if (err instanceof ApiHttpError) {
        if (err.payload?.code === 'TURNSTILE_REQUIRED' && err.payload?.siteKey) setSiteKey(err.payload.siteKey);
        setError(err.payload?.error || 'Não foi possível entrar.');
      } else setError('Não foi possível entrar.');
    } finally { setBusy(false); }
  }

  return <main class="login"><form class="loginCard" onSubmit={submit}><div class="kicker">Fluxo</div><h1>Seu financeiro</h1><div class="muted">Os dados ficam protegidos pela sessão do servidor. A senha não existe no JavaScript do app.</div><input class="input" type="password" autocomplete="current-password" placeholder="Senha" required value={password} onInput={e=>setPassword((e.target as HTMLInputElement).value)} />{siteKey && <div id="turnstile" style={{margin:'10px 0'}} />}{error && <div class="error">{error}</div>}<button class="btn primary" disabled={busy || (!!siteKey && !token)}>{busy ? 'Entrando…' : 'Entrar'}</button></form></main>;
}

export function App() {
  const [auth, setAuth] = useState<boolean|null>(null);
  const [page, setPageState] = useState<Page>(initialPage());
  const [entryKind, setEntryKind] = useState<EntryKind|null>(null);
  const [editing, setEditing] = useState<Entry|null>(null);
  const [settling, setSettling] = useState<Entry|null>(null);
  const [revision, setRevision] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const month = currentMonth();

  useEffect(() => { api.session().then(s => setAuth(s.authenticated)).catch(() => setAuth(false)); }, []);
  useEffect(() => {
    const sync = async () => { if (navigator.onLine && auth) await flushOutbox().catch(()=>undefined); setPendingSync(await getOutboxCount().catch(()=>0)); };
    sync(); window.addEventListener('online', sync); return () => window.removeEventListener('online', sync);
  }, [auth]);
  useEffect(() => {
    const params = new URLSearchParams(location.search); const action = params.get('action');
    if (action === 'expense' || action === 'income') setEntryKind(action);
  }, [auth]);
  useEffect(() => {
    const onPop = () => setPageState(initialPage());
    window.addEventListener('popstate',onPop); return () => window.removeEventListener('popstate',onPop);
  },[]);

  function setPage(next: Page) {
    setPageState(next); const url = new URL(location.href); url.searchParams.set('page', next); url.searchParams.delete('action'); history.pushState({}, '', url); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function refreshed() { setEntryKind(null); setEditing(null); setSettling(null); setRevision(x=>x+1); }
  async function remove(entry: Entry) { if (!confirm(`Excluir “${entry.description}”? Baixas já realizadas serão revertidas no ledger.`)) return; await api.deleteEntry(entry.id); refreshed(); }
  async function logout() { await api.logout().catch(()=>undefined); setAuth(false); }
  const edit=(e:Entry)=>{setEditing(e);setEntryKind(e.kind)};

  const titles = useMemo(() => ({ home:['Posição financeira','Visão geral'], flow:['Navegação temporal','Fluxo'], bills:['Operação diária','Contas'], planning:['Solvência','Planejamento'], income:['Entradas','Receitas'], expenses:['Saídas','Despesas'], more:['Estrutura','Mais'], admin:['Segurança e integridade','Admin'] } as const), []);
  if (auth === null) return <main class="login"><div class="loginCard">Carregando…</div></main>;
  if (!auth) return <Login onSuccess={() => { setAuth(true); setRevision(x=>x+1); }} />;

  const pageNode = page === 'home' ? <Dashboard key={revision} month={month} onNew={setEntryKind} onOpenPlanning={()=>setPage('planning')} />
    : page === 'flow' ? <Flow key={revision} onSettle={setSettling} onEdit={edit} onDelete={remove} />
    : page === 'bills' ? <Bills key={revision} onSettle={setSettling} onEdit={edit} onDelete={remove} />
    : page === 'planning' ? <Planning key={revision} month={month} />
    : page === 'income' ? <Records key={revision} kind="income" onSettle={setSettling} onEdit={edit} onDelete={remove}/>
    : page === 'expenses' ? <Records key={revision} kind="expense" onSettle={setSettling} onEdit={edit} onDelete={remove}/>
    : page === 'admin' ? <Admin key={revision} onBack={()=>setPage('more')} />
    : <More key={revision} onAdmin={()=>setPage('admin')} onNavigate={setPage} />;

  const nav: Array<[Page,string]> = [['home','Início'],['flow','Fluxo'],['bills','Contas'],['planning','Planejar'],['more','Mais'],['income','Receitas'],['expenses','Despesas'],['admin','Admin']];
  return <div class="app">
    <aside class="rail"><div class="brand">F</div>{nav.map(([key,label])=><button class={`navButton ${page===key?'active':''}`} onClick={()=>setPage(key)} title={label}>{label}</button>)}</aside>
    <div class="workspace"><header class="topbar"><div><small>{titles[page][0]}</small><h1>{titles[page][1]}</h1></div><div style="display:flex;align-items:center;gap:10px"><span class="sync">{navigator.onLine ? (pendingSync ? `${pendingSync} pendente(s)` : 'Sincronizado') : 'Offline'}</span><button class="btn secondary" onClick={logout}>Sair</button><button class="btn primary" onClick={()=>setEntryKind('expense')}>+ Lançamento</button></div></header><main class="content">{pageNode}</main></div>
    {entryKind && <EntryModal kind={entryKind} entry={editing} onClose={()=>{setEntryKind(null);setEditing(null)}} onSaved={refreshed} />}
    {settling && <SettlementModal entry={settling} onClose={()=>setSettling(null)} onSaved={refreshed} />}
  </div>;
}
