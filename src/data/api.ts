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

const patch = (path:string, body:unknown) => request(path,{method:'PATCH',body:JSON.stringify(body)});
const del = (path:string) => request(path,{method:'DELETE'});
const post = (path:string, body:unknown) => request(path,{method:'POST',body:JSON.stringify(body)});

export const api = {
  session: () => request<{ authenticated: boolean; turnstileSiteKey?: string }>('/api/auth/session'),
  login: (password: string, turnstileToken?: string) => request<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password, turnstileToken }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  dashboard: (month: string) => getCached<any>(`/api/dashboard?month=${month}`),
  entries: (from: string, to: string) => getCached<any>(`/api/entries?from=${from}&to=${to}`),
  accounts: () => getCached<any>('/api/accounts'),
  recurring: () => getCached<any>('/api/recurring'),
  reserves: () => getCached<any>('/api/reserves'),
  cards: () => getCached<any>('/api/cards'),
  cardPurchases: () => getCached<any>('/api/card-purchases'),
  categories: () => getCached<any>('/api/categories'),
  incomeSources: () => getCached<any>('/api/income-sources'),
  planning: (month: string) => getCached<any>(`/api/planning/month?month=${month}`),
  integrity: () => request<any>('/api/admin/integrity'),
  createEntry: async (body: unknown) => {
    if (!navigator.onLine) return queueWrite({ method: 'POST', path: '/api/entries', body });
    return post('/api/entries',body);
  },
  patchEntry: (id: string, body: unknown) => patch(`/api/entries/${id}`,body),
  deleteEntry: (id: string) => del(`/api/entries/${id}`),
  settle: (entryId: string, body: unknown) => post('/api/settlements',{entryId,...(body as object)}),
  createRecurring: (body: unknown) => post('/api/recurring',body),
  patchRecurring: (id:string,body:unknown)=>patch(`/api/recurring/${id}`,body),
  deleteRecurring: (id:string)=>del(`/api/recurring/${id}`),
  setMonthlyTarget: (month: string, targetCents: number) => request('/api/planning/target', { method: 'PUT', body: JSON.stringify({ month, targetCents }) }),
  createReserve: (body: unknown) => post('/api/reserves',body),
  patchReserve: (id:string,body:unknown)=>patch(`/api/reserves/${id}`,body),
  deleteReserve: (id:string)=>del(`/api/reserves/${id}`),
  createCard: (body: unknown) => post('/api/cards',body),
  patchCard: (id:string,body:unknown)=>patch(`/api/cards/${id}`,body),
  deleteCard: (id:string)=>del(`/api/cards/${id}`),
  createCardPurchase: (body:unknown)=>post('/api/card-purchases',body),
  patchCardPurchase: (id:string,body:unknown)=>patch(`/api/card-purchases/${id}`,body),
  deleteCardPurchase: (id:string)=>del(`/api/card-purchases/${id}`),
  createAccount: (body:unknown)=>post('/api/accounts',body),
  patchAccount: (id:string,body:unknown)=>patch(`/api/accounts/${id}`,body),
  deleteAccount: (id:string)=>del(`/api/accounts/${id}`),
  createCategory: (body:unknown)=>post('/api/categories',body),
  patchCategory: (id:string,body:unknown)=>patch(`/api/categories/${id}`,body),
  deleteCategory: (id:string)=>del(`/api/categories/${id}`),
  createIncomeSource: (body:unknown)=>post('/api/income-sources',body),
  patchIncomeSource: (id:string,body:unknown)=>patch(`/api/income-sources/${id}`,body),
  deleteIncomeSource: (id:string)=>del(`/api/income-sources/${id}`)
};
