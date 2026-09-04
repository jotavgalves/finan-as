import type { Env } from '../../server/env';
import { json } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const schema = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('entries','account_ledger','sessions')"
    ).first<{ n: number }>();
    const tables = Number(schema?.n || 0);
    const ok = tables >= 3;
    return json({ ok, database: ok ? 'ready' : 'schema_incomplete' }, ok ? 200 : 503);
  } catch {
    return json({ ok: false, database: 'unavailable' }, 503);
  }
};
