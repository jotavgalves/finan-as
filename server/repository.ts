import type { Env } from './env';
import { HttpError, nowIso, uuid } from './http';

export async function audit(env: Env, action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) {
  await env.DB.prepare('INSERT INTO audit_log (id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(uuid(), action, entityType, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, nowIso()).run();
}

export async function getOrCreateCategory(env: Env, name?: string | null) {
  const clean = (name || '').trim(); if (!clean) return null;
  const found = await env.DB.prepare('SELECT id FROM categories WHERE lower(name)=lower(?)').bind(clean).first<{id:string}>();
  if (found) return found.id;
  const id = uuid(), now = nowIso();
  await env.DB.prepare('INSERT INTO categories (id,name,budget_cents,created_at,updated_at) VALUES (?,?,0,?,?)').bind(id,clean,now,now).run();
  return id;
}

export async function getOrCreateSource(env: Env, name?: string | null) {
  const clean = (name || '').trim(); if (!clean) return null;
  const found = await env.DB.prepare('SELECT id FROM income_sources WHERE lower(name)=lower(?)').bind(clean).first<{id:string}>();
  if (found) return found.id;
  const id = uuid(), now = nowIso();
  await env.DB.prepare('INSERT INTO income_sources (id,name,expected_monthly_cents,created_at,updated_at) VALUES (?,?,0,?,?)').bind(id,clean,now,now).run();
  return id;
}

function mapEntry(row: any) {
  return {
    id: row.id, kind: row.kind, description: row.description, amountCents: Number(row.amount_cents),
    competenceDate: row.competence_date, dueDate: row.due_date,
    categoryId: row.category_id, categoryName: row.category_name,
    incomeSourceId: row.income_source_id, incomeSourceName: row.source_name,
    accountId: row.account_id, accountName: row.account_name,
    status: row.status, settledCents: Number(row.settled_cents || 0), recurringRuleId: row.recurring_rule_id,
    cardPurchaseId: row.card_purchase_id || null, cardInstallmentId: row.card_installment_id || null,
    paymentMethod: row.payment_method, version: Number(row.version || 1)
  };
}

const ENTRY_SELECT = `SELECT e.*, c.name category_name, s.name source_name, a.name account_name,
  COALESCE((SELECT SUM(st.amount_cents) FROM settlements st WHERE st.entry_id=e.id),0) settled_cents
  FROM entries e
  LEFT JOIN categories c ON c.id=e.category_id
  LEFT JOIN income_sources s ON s.id=e.income_source_id
  LEFT JOIN accounts a ON a.id=e.account_id`;

export async function listEntries(env: Env, from: string, to: string) {
  const result = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.deleted_at IS NULL AND e.due_date BETWEEN ? AND ? ORDER BY e.due_date ASC, e.created_at ASC`).bind(from,to).all<any>();
  return (result.results || []).map(mapEntry);
}

export async function getEntry(env: Env, id: string) {
  const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id=? AND e.deleted_at IS NULL`).bind(id).first<any>();
  return row ? mapEntry(row) : null;
}

export async function listAccounts(env: Env) {
  const result = await env.DB.prepare(`SELECT a.id,a.name,a.type,
    a.opening_balance_cents + COALESCE((SELECT SUM(l.delta_cents) FROM account_ledger l WHERE l.account_id=a.id),0) balance_cents,
    COALESCE((SELECT SUM(ra.amount_cents) FROM reserve_allocations ra WHERE ra.account_id=a.id),0) reserved_cents
    FROM accounts a WHERE a.archived_at IS NULL ORDER BY a.name`).all<any>();
  return (result.results || []).map(r => ({ id:r.id,name:r.name,type:r.type,balanceCents:Number(r.balance_cents||0),reservedCents:Number(r.reserved_cents||0),freeCents:Number(r.balance_cents||0)-Number(r.reserved_cents||0) }));
}

export async function createEntry(env: Env, input: any, forcedRecurringRuleId?: string | null, forcedOccurrence?: string | null) {
  if (!['income','expense'].includes(input.kind)) throw new HttpError(400,'Tipo inválido.');
  if (!input.description?.trim()) throw new HttpError(400,'Descrição obrigatória.');
  const amount = Number(input.amountCents); if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400,'Valor inválido.');
  const dueDate = input.dueDate || input.competenceDate; if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '')) throw new HttpError(400,'Data inválida.');
  const categoryId = input.kind==='expense' ? await getOrCreateCategory(env,input.categoryName) : null;
  const sourceId = input.kind==='income' ? await getOrCreateSource(env,input.incomeSourceName) : null;
  const id = input.id || uuid(), now = nowIso();
  await env.DB.prepare(`INSERT INTO entries (id,kind,description,amount_cents,competence_date,due_date,category_id,income_source_id,account_id,status,payment_method,recurring_rule_id,occurrence_date,created_at,updated_at,version)
    VALUES (?,?,?,?,?,?,?,?,?,'planned',?,?,?,?,?,1)`)
    .bind(id,input.kind,input.description.trim(),amount,input.competenceDate||dueDate,dueDate,categoryId,sourceId,input.accountId||null,input.paymentMethod||null,forcedRecurringRuleId||null,forcedOccurrence||null,now,now).run();
  const entry = await getEntry(env,id); await audit(env,'entry.created','entry',id,null,entry); return entry;
}

export async function updateEntry(env: Env, id: string, input: any) {
  const before = await getEntry(env,id); if (!before) throw new HttpError(404,'Lançamento não encontrado.');
  if (before.cardPurchaseId) throw new HttpError(409,'Esta obrigação pertence a uma compra no cartão. Edite a compra em Admin > Compras.','CARD_PURCHASE_LINKED');
  const expected = input.expectedVersion == null ? before.version : Number(input.expectedVersion);
  if (expected !== before.version) throw new HttpError(409,'Este lançamento foi alterado em outro dispositivo. Atualize a tela.','VERSION_CONFLICT');
  const amount = input.amountCents == null ? before.amountCents : Number(input.amountCents);
  if (!Number.isInteger(amount) || amount <= 0 || amount < before.settledCents) throw new HttpError(400,'O valor não pode ser menor que o já liquidado.');
  const kind = input.kind || before.kind;
  if (before.settledCents > 0 && kind !== before.kind) throw new HttpError(400,'Não é possível trocar receita por despesa após uma baixa.');
  const categoryId = kind==='expense' ? await getOrCreateCategory(env,input.categoryName ?? before.categoryName) : null;
  const sourceId = kind==='income' ? await getOrCreateSource(env,input.incomeSourceName ?? before.incomeSourceName) : null;
  const due = input.dueDate || before.dueDate, competence=input.competenceDate||before.competenceDate, now=nowIso();
  const nextStatus = before.settledCents >= amount ? 'done' : (before.status==='cancelled'?'cancelled':'planned');
  const result = await env.DB.prepare(`UPDATE entries SET kind=?,description=?,amount_cents=?,competence_date=?,due_date=?,category_id=?,income_source_id=?,account_id=?,status=?,payment_method=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL`)
    .bind(kind,(input.description??before.description).trim(),amount,competence,due,categoryId,sourceId,input.accountId??before.accountId,nextStatus,input.paymentMethod??before.paymentMethod,now,id,before.version).run();
  if (!result.meta.changes) throw new HttpError(409,'Conflito ao salvar.','VERSION_CONFLICT');
  const after=await getEntry(env,id);await audit(env,'entry.updated','entry',id,before,after);return after;
}

export async function settleEntry(env: Env, entryId: string, input: any) {
  const entry=await getEntry(env,entryId);if(!entry)throw new HttpError(404,'Lançamento não encontrado.');
  const outstanding=entry.amountCents-entry.settledCents, amount=Number(input.amountCents);
  if(!Number.isInteger(amount)||amount<=0||amount>outstanding)throw new HttpError(400,'Valor da baixa inválido.');
  if(!input.accountId)throw new HttpError(400,'Selecione a conta financeira.');
  const acc=await env.DB.prepare('SELECT id FROM accounts WHERE id=? AND archived_at IS NULL').bind(input.accountId).first();if(!acc)throw new HttpError(400,'Conta financeira inválida.');
  const settlementId=uuid(),ledgerId=uuid(),now=nowIso(),date=input.date||now.slice(0,10),delta=entry.kind==='income'?amount:-amount;
  const newSettled=entry.settledCents+amount,newStatus=newSettled>=entry.amountCents?'done':'planned';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO settlements (id,entry_id,amount_cents,date,payment_method,account_id,created_at) VALUES (?,?,?,?,?,?,?)').bind(settlementId,entryId,amount,date,input.paymentMethod||entry.paymentMethod||null,input.accountId,now),
    env.DB.prepare('INSERT INTO account_ledger (id,account_id,delta_cents,occurred_at,source_type,source_id,description,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(ledgerId,input.accountId,delta,date,'settlement',settlementId,entry.description,now),
    env.DB.prepare('UPDATE entries SET status=?,updated_at=?,version=version+1 WHERE id=?').bind(newStatus,now,entryId)
  ]);
  const after=await getEntry(env,entryId);await audit(env,'entry.settled','entry',entryId,entry,{settlementId,amountCents:amount,entry:after});return after;
}

export async function deleteEntry(env: Env,id:string,allowCardLinked=false){
  const before=await getEntry(env,id);if(!before)throw new HttpError(404,'Lançamento não encontrado.');
  if(before.cardPurchaseId&&!allowCardLinked)throw new HttpError(409,'Esta obrigação pertence a uma compra no cartão. Exclua ou edite a compra em Admin > Compras.','CARD_PURCHASE_LINKED');
  const settlements=await env.DB.prepare('SELECT * FROM settlements WHERE entry_id=?').bind(id).all<any>();
  const now=nowIso();const statements:any[]=[];
  for(const st of settlements.results||[]){
    const original=await env.DB.prepare("SELECT id,delta_cents,account_id FROM account_ledger WHERE source_type='settlement' AND source_id=? ORDER BY created_at LIMIT 1").bind(st.id).first<any>();
    if(original)statements.push(env.DB.prepare('INSERT INTO account_ledger (id,account_id,delta_cents,occurred_at,source_type,source_id,description,reversal_of_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(uuid(),original.account_id,-Number(original.delta_cents),now.slice(0,10),'reversal',id,`Reversão: ${before.description}`,original.id,now));
  }
  statements.push(env.DB.prepare('UPDATE entries SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?').bind(now,now,id));
  await env.DB.batch(statements);await audit(env,'entry.deleted','entry',id,before,null);
}
