import type { Env, SessionRecord } from './env';
import { HttpError, nowIso, uuid } from './http';

const enc = new TextEncoder();

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

function cookieMap(request: Request) {
  const out: Record<string,string> = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const idx = part.indexOf('='); if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1));
  }
  return out;
}

export async function getSession(request: Request, env: Env): Promise<SessionRecord | null> {
  const token = cookieMap(request).fluxo_session;
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT id, token_hash, expires_at, created_at, last_seen_at FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(hash, nowIso()).first<SessionRecord>();
  if (!row) return null;
  env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.id).run().catch(()=>undefined);
  return row;
}

export async function requireSession(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, 'Sessão necessária.', 'UNAUTHENTICATED');
  return session;
}

export async function createSession(env: Env) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const days = Math.max(1, Number(env.SESSION_TTL_DAYS || 30));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const id = uuid(), now = nowIso();
  await env.DB.prepare('INSERT INTO sessions (id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, tokenHash, expires, now, now).run();
  return {
    token,
    cookie: `fluxo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${days * 86400}`
  };
}

export function clearSessionCookie() {
  return 'fluxo_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

export async function destroySession(request: Request, env: Env) {
  const token = cookieMap(request).fluxo_session;
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function loginKey(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return hmacHex(env.SESSION_SECRET, ip);
}

export async function getAttemptState(request: Request, env: Env) {
  const key = await loginKey(request, env);
  const row = await env.DB.prepare('SELECT key_hash, failures, window_start, locked_until FROM login_attempts WHERE key_hash = ?').bind(key).first<any>();
  return { key, row };
}

export async function assertLoginAllowed(request: Request, env: Env) {
  const { key, row } = await getAttemptState(request, env);
  const now = Date.now();
  if (row?.locked_until && new Date(row.locked_until).getTime() > now) {
    throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde.', 'RATE_LIMITED');
  }
  const recent = row && now - new Date(row.window_start).getTime() < 10 * 60_000;
  return { key, failures: recent ? Number(row.failures || 0) : 0 };
}

export async function recordLoginFailure(env: Env, key: string, previousFailures: number) {
  const failures = previousFailures + 1;
  const now = nowIso();
  const locked = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
  await env.DB.prepare(`INSERT INTO login_attempts (key_hash, failures, window_start, locked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key_hash) DO UPDATE SET failures=excluded.failures, window_start=CASE WHEN login_attempts.window_start < datetime('now','-10 minutes') THEN excluded.window_start ELSE login_attempts.window_start END, locked_until=excluded.locked_until, updated_at=excluded.updated_at`)
    .bind(key, failures, now, locked, now).run();
}

export async function clearLoginFailures(env: Env, key: string) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(key).run();
}

export async function passwordMatches(input: string, env: Env) {
  if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD não configurada.');
  const [a,b] = await Promise.all([sha256Hex(input), sha256Hex(env.ADMIN_PASSWORD)]);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length,b.length);
  for (let i=0;i<n;i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diff === 0;
}

export async function verifyTurnstile(env: Env, token: string | undefined, request: Request) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData(); form.set('secret', env.TURNSTILE_SECRET); form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method:'POST', body:form });
  const data = await res.json<any>();
  return !!data.success;
}
