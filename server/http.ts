export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Conteúdo deve ser JSON.');
  try { return await request.json() as T; }
  catch { throw new HttpError(400, 'JSON inválido.'); }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) { super(message); }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message, code: error.code, ...(error.extra || {}) }, error.status);
  console.error(error);
  return json({ error: 'Erro interno.' }, 500);
}

export function uuid() { return crypto.randomUUID(); }
export function nowIso() { return new Date().toISOString(); }
