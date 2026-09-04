import { useEffect, useState } from 'preact/hooks';
import type { AccountSummary, Entry, EntryKind } from '../../shared/types';
import { api } from '../data/api';
import { toCents } from '../lib/money';

export function EntryModal(props: { kind: EntryKind; entry?: Entry | null; onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]),[cards,setCards]=useState<any[]>([]),[labels,setLabels]=useState<any[]>([]);
  const [description, setDescription] = useState(props.entry?.description || '');
  const [amount, setAmount] = useState(props.entry ? String(props.entry.amountCents / 100) : '');
  const [dueDate, setDueDate] = useState(props.entry?.dueDate || new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState(props.entry?.categoryName || props.entry?.incomeSourceName || '');
  const [accountId, setAccountId] = useState(props.entry?.accountId || '');
  const [paymentMethod, setPaymentMethod] = useState(props.entry?.paymentMethod || 'Pix');
  const [cardId,setCardId]=useState(''),[installments,setInstallments]=useState('1'),[firstDueDate,setFirstDueDate]=useState('');
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly'|'biweekly'|'monthly'|'yearly'>('monthly');
  const [nature, setNature] = useState<'fixed'|'estimated'>('fixed');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { Promise.all([api.accounts(),api.cards(),props.kind==='income'?api.incomeSources():api.categories()]).then(([a,c,l])=>{setAccounts(a.accounts||[]);setCards(c.cards||[]);setLabels(props.kind==='income'?(l.sources||[]):(l.categories||[]));if(!cardId&&(c.cards||[])[0])setCardId((c.cards||[])[0].id)}).catch(() => undefined); }, [props.kind]);
  const isNewCardPurchase=!props.entry&&props.kind==='expense'&&paymentMethod==='Crédito';

  async function submit(event: Event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      if(isNewCardPurchase){if(!cardId)throw new Error('Cadastre ou selecione um cartão.');await api.createCardPurchase({cardId,description,totalCents:toCents(amount),purchaseDate:dueDate,categoryName:label,installmentCount:Number(installments||1),firstDueDate:firstDueDate||undefined});props.onSaved();return}
      const body = {
        kind: props.kind,
        description,
        amountCents: toCents(amount),
        competenceDate: dueDate,
        dueDate,
        accountId: accountId || null,
        categoryName: props.kind === 'expense' ? label : null,
        incomeSourceName: props.kind === 'income' ? label : null,
        paymentMethod,
        recurring: recurring ? { frequency, nature, startDate: dueDate } : null,
        expectedVersion: props.entry?.version
      };
      if (props.entry) await api.patchEntry(props.entry.id, body);
      else await api.createEntry(body);
      props.onSaved();
    } catch (e: any) { setError(e?.payload?.error || e.message || 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  return <div class="modalBackdrop" onClick={e => e.currentTarget === e.target && props.onClose()}>
    <form class="modal" onSubmit={submit}>
      <h2>{props.entry ? 'Editar' : 'Novo'} {props.kind === 'income' ? 'recebimento' : 'gasto'}</h2>
      <div class="formGrid">
        <div class="field full"><label>Descrição</label><input class="input" required value={description} onInput={e => setDescription((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Valor</label><input class="input" required inputMode="decimal" value={amount} onInput={e => setAmount((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>{isNewCardPurchase?'Data da compra':'Data / vencimento'}</label><input class="input" required type="date" value={dueDate} onInput={e => setDueDate((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>{props.kind === 'income' ? 'Fonte' : 'Categoria'}</label><input class="input" list="entry-labels" value={label} onInput={e => setLabel((e.target as HTMLInputElement).value)} placeholder={props.kind === 'income' ? 'Salário principal' : 'Moradia'} /><datalist id="entry-labels">{labels.map(x=><option value={x.name}/>)}</datalist></div>
        <div class="field"><label>Pagamento</label><select class="select" value={paymentMethod} onChange={e => setPaymentMethod((e.target as HTMLSelectElement).value)}><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option></select></div>
        {!isNewCardPurchase&&<div class="field"><label>Conta financeira</label><select class="select" value={accountId} onChange={e => setAccountId((e.target as HTMLSelectElement).value)}><option value="">Sem conta definida</option>{accounts.map(a => <option value={a.id}>{a.name}</option>)}</select></div>}
        {isNewCardPurchase&&<><div class="field"><label>Cartão</label><select class="select" required value={cardId} onChange={e=>setCardId((e.target as HTMLSelectElement).value)}><option value="">Selecione</option>{cards.map(c=><option value={c.id}>{c.name}</option>)}</select></div><div class="field"><label>Parcelas</label><input class="input" type="number" min="1" max="60" value={installments} onInput={e=>setInstallments((e.target as HTMLInputElement).value)}/></div><div class="field"><label>Primeiro vencimento</label><input class="input" type="date" value={firstDueDate} onInput={e=>setFirstDueDate((e.target as HTMLInputElement).value)}/></div></>}
        {!props.entry&&!isNewCardPurchase && <div class="field"><label>Recorrência</label><select class="select" value={recurring ? 'yes' : 'no'} onChange={e => setRecurring((e.target as HTMLSelectElement).value === 'yes')}><option value="no">Não se repete</option><option value="yes">Se repete</option></select></div>}
        {recurring && <><div class="field"><label>Frequência</label><select class="select" value={frequency} onChange={e => setFrequency((e.target as HTMLSelectElement).value as any)}><option value="weekly">Toda semana</option><option value="biweekly">A cada 15 dias</option><option value="monthly">Todo mês</option><option value="yearly">Todo ano</option></select></div><div class="field"><label>Valor</label><select class="select" value={nature} onChange={e => setNature((e.target as HTMLSelectElement).value as any)}><option value="fixed">Fixo</option><option value="estimated">Variável / estimado</option></select></div></>}
      </div>
      {isNewCardPurchase&&<div class="muted" style="margin-top:10px">A compra ficará no cartão e cada parcela será criada automaticamente como obrigação futura no Fluxo/Planejamento.</div>}
      {error && <div class="error">{error}</div>}
      <div class="modalActions"><button type="button" class="btn" onClick={props.onClose}>Cancelar</button><button class="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></div>
    </form>
  </div>;
}
