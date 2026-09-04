import type { Env } from '../../../server/env';
import { audit, listAccounts } from '../../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../../server/http';

async function getReserve(env: Env, id: string) {
  const reserve = await env.DB.prepare('SELECT * FROM reserves WHERE id=? AND active=1').bind(id).first<any>();
  if (!reserve) return null;
  const allocations = await env.DB.prepare('SELECT * FROM reserve_allocations WHERE reserve_id=?').bind(id).all<any>();
  return { ...reserve, allocations: allocations.results || [] };
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const id = String(params.id);
    const before = await getReserve(env, id);
    if (!before) throw new HttpError(404, 'Reserva não encontrada.');

    const body = await readJson<any>(request);
    const name = String(body.name ?? before.name).trim();
    const goal = body.goalCents == null ? Number(before.goal_cents) : Number(body.goalCents);
    const allocations = Array.isArray(body.allocations) ? body.allocations : null;

    if (!name) throw new HttpError(400, 'Nome obrigatório.');
    if (!Number.isInteger(goal) || goal < 0) throw new HttpError(400, 'Meta inválida.');

    const now = nowIso();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare('UPDATE reserves SET name=?,goal_cents=?,updated_at=?,version=version+1 WHERE id=?').bind(name, goal, now, id)
    ];

    if (allocations) {
      const accounts = await listAccounts(env);
      const current = new Map<string, number>(
        (before.allocations || []).map((item: any): [string, number] => [
          String(item.account_id),
          Number(item.amount_cents || 0)
        ])
      );

      for (const allocation of allocations as Array<{ accountId: string; amountCents: number }>) {
        const accountId = String(allocation.accountId || '');
        const amount = Number(allocation.amountCents || 0);
        const account = accounts.find(item => item.id === accountId);
        if (!account || !Number.isInteger(amount) || amount < 0) throw new HttpError(400, 'Alocação inválida.');

        const ownAllocation = Number(current.get(accountId) || 0);
        const availableForThisReserve = Number(account.freeCents) + ownAllocation;
        if (amount > availableForThisReserve) throw new HttpError(400, `Saldo livre insuficiente em ${account.name}.`);
      }

      statements.push(env.DB.prepare('DELETE FROM reserve_allocations WHERE reserve_id=?').bind(id));
      for (const allocation of (allocations as Array<{ accountId: string; amountCents: number }>).filter(item => Number(item.amountCents) > 0)) {
        statements.push(
          env.DB.prepare('INSERT INTO reserve_allocations (id,reserve_id,account_id,amount_cents,created_at,updated_at) VALUES (?,?,?,?,?,?)')
            .bind(uuid(), id, allocation.accountId, Number(allocation.amountCents), now, now)
        );
      }
    }

    await env.DB.batch(statements);
    const after = await getReserve(env, id);
    await audit(env, 'reserve.updated', 'reserve', id, before, after);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const id = String(params.id);
    const before = await getReserve(env, id);
    if (!before) throw new HttpError(404, 'Reserva não encontrada.');

    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reserve_allocations WHERE reserve_id=?').bind(id),
      env.DB.prepare('UPDATE reserves SET active=0,updated_at=?,version=version+1 WHERE id=?').bind(now, id)
    ]);
    await audit(env, 'reserve.deleted', 'reserve', id, before, null);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
