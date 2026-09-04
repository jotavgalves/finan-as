import type { Env } from '../../server/env';
import { requireSession } from '../../server/auth';
import { errorResponse } from '../../server/http';

export const onRequest: PagesFunction<Env> = async (context) => {
  const path = new URL(context.request.url).pathname;
  if (path === '/api/auth/login' || path === '/api/auth/session') return context.next();
  try { await requireSession(context.request, context.env); return context.next(); }
  catch (error) { return errorResponse(error); }
};
