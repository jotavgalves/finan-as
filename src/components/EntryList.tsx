import type { Entry } from '../../shared/types';
import { money } from '../lib/money';

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${value}T12:00:00`)).replace('.', '').toUpperCase();
}

export function EntryList(props: {
  entries: Entry[];
  onSettle?: (entry: Entry) => void;
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
}) {
  if (!props.entries.length) return <div class="list"><div class="empty">Nenhum lançamento encontrado.</div></div>;
  return <div class="list">
    {props.entries.map(entry => {
      const outstanding = Math.max(0, entry.amountCents - entry.settledCents);
      const status = entry.status === 'done' ? (entry.kind === 'income' ? 'recebida' : 'paga') : entry.settledCents > 0 ? 'parcial' : 'prevista';
      return <div class="row" key={entry.id}>
        <div class="rowDate">{dateLabel(entry.dueDate)}</div>
        <div class="rowMain">
          <strong>{entry.description}</strong>
          <small>{entry.categoryName || entry.incomeSourceName || 'Sem categoria'} · {entry.accountName || 'Sem conta'} · {status}</small>
          {entry.settledCents > 0 && entry.status !== 'done' && <small>{money(entry.settledCents)} liquidado · {money(outstanding)} restante</small>}
        </div>
        <div class={`rowValue ${entry.kind === 'income' ? 'income' : 'expense'}`}>{entry.kind === 'income' ? '+ ' : '− '}{money(entry.amountCents)}</div>
        <div class="rowAction" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          {entry.status === 'planned' && props.onSettle && <button class="btn primary" onClick={() => props.onSettle?.(entry)}>{entry.kind === 'income' ? 'Receber' : 'Pagar'}</button>}
          {props.onEdit && <button class="btn" onClick={() => props.onEdit?.(entry)}>Editar</button>}
          {props.onDelete && <button class="btn danger" onClick={() => props.onDelete?.(entry)}>Excluir</button>}
        </div>
      </div>;
    })}
  </div>;
}
