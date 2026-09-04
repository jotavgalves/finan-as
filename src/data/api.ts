import { cacheGet, cacheSet, queueWrite } from './offline';

export class ApiHttpError extends Error {
  constructor(public status: number, public payload: any) {
    super(payload?.error || `HTTP ${status}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiHttpError(res.status, payload);
  return payload as T;
}

export async function getCached<T>(path: string): Promise<T> {
  try {
    const data = await request<T>(path);
    await cacheSet(path, data);
    return data;
  } catch (error) {
    const cached = await cacheGet<T>(path);
    if (cached) return cached;
    throw error;
  }
}

export const api = {
  session: () => request<{ authenticated: boolean; turnstileSiteKey?: string }>('/api/auth/session'),
  login: (password: string, turnstileToken?: string) => request<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password, turnstileToken }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  dashboard: (month: string) => getCached<any>(`/api/dashboard?month=${month}`),
  entries: (from: string, to: string) => getCached<any>(`/api/entries?from=${from}&to=${to}`),
  accounts: () => getCached<any>('/api/accounts'),
  recurring: () => getCached<any>('/api/recurring'),
  planning: (month: string) => getCached<any>(`/api/planning/month?month=${month}`),
  integrity: () => request<any>('/api/admin/integrity'),
  createEntry: async (body: unknown) => {
    if (!navigator.onLine) return queueWrite({ method: 'POST', path: '/api/entries', body });
    return request('/api/entries', { method: 'POST', body: JSON.stringify(body) });
  },
  patchEntry: (id: string, body: unknown) => request(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEntry: (id: string) => request(`/api/entries/${id}`, { method: 'DELETE' }),
  settle: (entryId: string, body: unknown) => request('/api/settlements', { method: 'POST', body: JSON.stringify({ entryId, ...(body as object) }) }),
  createRecurring: (body: unknown) => request('/api/recurring', { method: 'POST', body: JSON.stringify(body) })
};
