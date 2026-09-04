import type { Env } from '../../../server/env';
import { clearSessionCookie, destroySession } from '../../../server/auth';
import { errorResponse, json } from '../../../server/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await destroySession(request, env);
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  } catch (error) { return errorResponse(error); }
};
