import type { Env } from '../../../server/env';
import { listAccounts } from '../../../server/repository';
import { errorResponse, json, nowIso } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [fk,overflow,duplicates,sessions,locked,accounts]=await Promise.all([
      env.DB.prepare('PRAGMA foreign_key_check').all<any>(),
      env.DB.prepare(`SELECT e.id FROM entries e WHERE e.deleted_at IS NULL AND COALESCE((SELECT SUM(s.amount_cents) FROM settlements s WHERE s.entry_id=e.id),0) > e.amount_cents LIMIT 1`).first(),
      env.DB.prepare(`SELECT recurring_rule_id,occurrence_date,COUNT(*) n FROM entries WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL GROUP BY recurring_rule_id,occurrence_date HAVING n>1 LIMIT 1`).first(),
      env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE expires_at>?').bind(nowIso()).first<any>(),
      env.DB.prepare('SELECT COUNT(*) n FROM login_attempts WHERE locked_until>?').bind(nowIso()).first<any>(),
      listAccounts(env)
    ]);
    const reservesOk=accounts.every(a=>a.reservedCents<=Math.max(0,a.balanceCents));
    return json({checks:{'Foreign keys':(fk.results||[]).length===0,'Baixas ≤ lançamentos':!overflow,'Recorrências sem duplicidade':!duplicates,'Reservas compatíveis com saldos':reservesOk},sessions:Number(sessions?.n||0),lockedAttempts:Number(locked?.n||0)});
  }catch(error){return errorResponse(error);}
};
