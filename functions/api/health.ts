import type { Env } from '../../server/env';
import { json } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM _cf_KV').first<any>().catch(() => null);
    // _cf_KV is not expected in D1; the fallback below verifies the actual app schema.
    const schema = row || await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('entries','account_ledger','sessions')").first<any>();
    const tables = Number(schema?.n || 0);
    return json({ ok: tables >= 3, database: tables >= 3 ? 'ready' : 'schema_incomplete' }, tables >= 3 ? 200 : 503);
  } catch {
    return json({ ok: false, database: 'unavailable' }, 503);
  }
};
