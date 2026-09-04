import type { Env } from '../../../server/env';
import { assertLoginAllowed, clearLoginFailures, createSession, passwordMatches, recordLoginFailure, verifyTurnstile } from '../../../server/auth';
import { errorResponse, HttpError, json, readJson } from '../../../server/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await readJson<{password?:string;turnstileToken?:string}>(request);
    const state = await assertLoginAllowed(request, env);
    if (state.failures >= 3 && env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(env, body.turnstileToken, request);
      if (!ok) throw new HttpError(429, 'Confirme o desafio de segurança para continuar.', 'TURNSTILE_REQUIRED', { siteKey: env.TURNSTILE_SITE_KEY || '' });
    }
    if (!body.password || !(await passwordMatches(body.password, env))) {
      await recordLoginFailure(env, state.key, state.failures);
      throw new HttpError(401, 'Credenciais inválidas.');
    }
    await clearLoginFailures(env, state.key);
    const session = await createSession(env);
    return json({ ok: true }, 200, { 'set-cookie': session.cookie });
  } catch (error) { return errorResponse(error); }
};
