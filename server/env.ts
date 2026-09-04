export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  SESSION_TTL_DAYS?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
}

export interface SessionRecord {
  id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
}
