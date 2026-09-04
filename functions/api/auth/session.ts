import type { Env } from '../../../server/env';
import { getSession } from '../../../server/auth';
import { errorResponse, json } from '../../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const session = await getSession(request, env);
    return json({ authenticated: !!session, turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined });
  } catch (error) { return errorResponse(error); }
};
