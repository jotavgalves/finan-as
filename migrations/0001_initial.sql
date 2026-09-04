CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'bank',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  budget_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  expected_monthly_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  income_source_id TEXT REFERENCES income_sources(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  payment_method TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly','yearly')),
  nature TEXT NOT NULL DEFAULT 'fixed' CHECK(nature IN ('fixed','estimated')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  competence_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  income_source_id TEXT REFERENCES income_sources(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  payment_method TEXT,
  recurring_rule_id TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL,
  occurrence_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_recurring_occurrence
ON entries(recurring_rule_id, occurrence_date)
WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_due ON entries(due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_competence ON entries(competence_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(income_source_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  date TEXT NOT NULL,
  payment_method TEXT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_entry ON settlements(entry_id);
CREATE INDEX IF NOT EXISTS idx_settlements_date ON settlements(date);

CREATE TABLE IF NOT EXISTS account_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  delta_cents INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NOT NULL,
  reversal_of_id TEXT REFERENCES account_ledger(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account_date ON account_ledger(account_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON account_ledger(source_type, source_id);

CREATE TABLE IF NOT EXISTS reserves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  goal_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reserve_allocations (
  id TEXT PRIMARY KEY,
  reserve_id TEXT NOT NULL REFERENCES reserves(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(reserve_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_reserve_alloc_account ON reserve_allocations(account_id);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  payment_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  limit_cents INTEGER NOT NULL DEFAULT 0,
  closing_day INTEGER NOT NULL CHECK(closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS card_purchases (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents > 0),
  purchase_date TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  installment_count INTEGER NOT NULL DEFAULT 1 CHECK(installment_count > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS card_installments (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES card_purchases(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','posted','paid','cancelled')),
  created_at TEXT NOT NULL,
  UNIQUE(purchase_id, number)
);
CREATE INDEX IF NOT EXISTS idx_installments_due ON card_installments(due_date);

CREATE TABLE IF NOT EXISTS monthly_targets (
  month TEXT PRIMARY KEY,
  minimum_free_balance_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

INSERT OR IGNORE INTO accounts (id,name,type,opening_balance_cents,created_at,updated_at) VALUES
 ('acc_inter','Inter','bank',0,datetime('now'),datetime('now')),
 ('acc_nubank','Nubank','bank',0,datetime('now'),datetime('now')),
 ('acc_mp','Mercado Pago','wallet',0,datetime('now'),datetime('now')),
 ('acc_cash','Dinheiro','cash',0,datetime('now'),datetime('now'));

INSERT OR IGNORE INTO categories (id,name,budget_cents,created_at,updated_at) VALUES
 ('cat_moradia','Moradia',0,datetime('now'),datetime('now')),
 ('cat_alimentacao','Alimentação',0,datetime('now'),datetime('now')),
 ('cat_transporte','Transporte',0,datetime('now'),datetime('now')),
 ('cat_lazer','Lazer',0,datetime('now'),datetime('now')),
 ('cat_assinaturas','Assinaturas',0,datetime('now'),datetime('now')),
 ('cat_eventos','Eventos',0,datetime('now'),datetime('now')),
 ('cat_outros','Outros',0,datetime('now'),datetime('now'));

INSERT OR IGNORE INTO income_sources (id,name,expected_monthly_cents,created_at,updated_at) VALUES
 ('src_salary','Salário principal',0,datetime('now'),datetime('now')),
 ('src_gtrz','GTRZ Eventos',0,datetime('now'),datetime('now')),
 ('src_freelance','Freelance',0,datetime('now'),datetime('now'));
