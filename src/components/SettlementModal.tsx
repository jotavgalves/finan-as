import { useEffect, useState } from 'preact/hooks';
import type { AccountSummary, Entry } from '../../shared/types';
import { api } from '../data/api';
import { money, toCents } from '../lib/money';

export function SettlementModal(props: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const outstanding = Math.max(0, props.entry.amountCents - props.entry.settledCents);
  const [amount, setAmount] = useState(String(outstanding / 100));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(props.entry.paymentMethod || 'Pix');
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountId, setAccountId] = useState(props.entry.accountId || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.accounts().then(r => setAccounts(r.accounts || [])).catch(() => undefined); }, []);

  async function submit(e: Event) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.settle(props.entry.id, { amountCents: toCents(amount), date, paymentMethod: method, accountId });
      props.onSaved();
    } catch (err: any) { setError(err?.payload?.error || err.message || 'Falha ao registrar baixa.'); }
    finally { setSaving(false); }
  }

  return <div class="modalBackdrop" onClick={e => e.currentTarget === e.target && props.onClose()}>
    <form class="modal" onSubmit={submit}>
      <h2>{props.entry.kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento'}</h2>
      <div class="muted" style="margin-bottom:16px">{props.entry.description} · restante {money(outstanding)}</div>
      <div class="formGrid">
        <div class="field"><label>Valor desta baixa</label><input class="input" inputMode="decimal" required value={amount} onInput={e => setAmount((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Data</label><input class="input" type="date" required value={date} onInput={e => setDate((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Forma</label><select class="select" value={method} onChange={e => setMethod((e.target as HTMLSelectElement).value)}><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option></select></div>
        <div class="field"><label>Conta financeira</label><select class="select" required value={accountId} onChange={e => setAccountId((e.target as HTMLSelectElement).value)}><option value="">Selecione</option>{accounts.map(a => <option value={a.id}>{a.name}</option>)}</select></div>
      </div>
      {error && <div class="error">{error}</div>}
      <div class="modalActions"><button type="button" class="btn" onClick={props.onClose}>Cancelar</button><button class="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Confirmar baixa'}</button></div>
    </form>
  </div>;
}
