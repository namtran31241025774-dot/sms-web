// Lược đồ dữ liệu SMS (SQLite). Nhóm theo phân loại trong brief mục 6:
// master (accounts, contacts, products, price lists), operational (leads, opportunities,
// quotes, orders, invoices, payments), content (activities, email), AI (ai_runs, ai_suggestions,
// opportunity_research), metadata (settings), traceability (audit_log).
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('SALES','PRESALES','PRESALES_MANAGER','SALES_MANAGER','FINANCE','LEGAL','DELIVERY','ADMIN','AI_MANAGER')),
  title TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

-- ===== Master data =====
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  email_domain TEXT,
  address TEXT,
  employee_size TEXT,
  owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  full_name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  website TEXT,
  strengths TEXT,
  weaknesses TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SUBSCRIPTION','SERVICE','TRAINING')),
  unit TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  UNIQUE (price_list_id, product_id)
);

-- ===== Qualify =====
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  company_norm TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_title TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  address_normalized TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  industry TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WORKING','CONVERTED','DISQUALIFIED')),
  bant_budget INTEGER NOT NULL DEFAULT 0,
  bant_authority INTEGER NOT NULL DEFAULT 0,
  bant_need INTEGER NOT NULL DEFAULT 0,
  bant_timeline INTEGER NOT NULL DEFAULT 0,
  bant_score INTEGER NOT NULL DEFAULT 0,
  bant_notes TEXT,
  duplicate_flag INTEGER NOT NULL DEFAULT 0,
  disqualify_reason TEXT,
  owner_id INTEGER REFERENCES users(id),
  converted_account_id INTEGER REFERENCES accounts(id),
  converted_contact_id INTEGER REFERENCES contacts(id),
  converted_opportunity_id INTEGER,
  converted_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NOTE','CALL','EMAIL','MEETING')),
  direction TEXT CHECK (direction IN ('IN','OUT')),
  subject TEXT NOT NULL,
  body TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI','INTEGRATION')),
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);

-- ===== Develop =====
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  primary_contact_id INTEGER REFERENCES contacts(id),
  owner_id INTEGER REFERENCES users(id),
  presales_id INTEGER REFERENCES users(id),
  lead_id INTEGER REFERENCES leads(id),
  stage TEXT NOT NULL DEFAULT 'DEVELOP' CHECK (stage IN ('DEVELOP','PROPOSE','CLOSE','WON','LOST')),
  amount INTEGER NOT NULL DEFAULT 0,
  close_date TEXT,
  price_list_id INTEGER REFERENCES price_lists(id),
  customer_need TEXT,
  need_confirmed INTEGER NOT NULL DEFAULT 0,
  proposed_solution TEXT,
  solution_confirmed INTEGER NOT NULL DEFAULT 0,
  stakeholders_confirmed INTEGER NOT NULL DEFAULT 0,
  competitors_confirmed INTEGER NOT NULL DEFAULT 0,
  importance TEXT CHECK (importance IN ('LOW','MEDIUM','HIGH')),
  lost_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  contact_id INTEGER REFERENCES contacts(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('DECISION_MAKER','INFLUENCER','CHAMPION','BLOCKER','USER')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS opportunity_competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  competitor_id INTEGER NOT NULL REFERENCES competitors(id),
  notes TEXT,
  UNIQUE (opportunity_id, competitor_id)
);

CREATE TABLE IF NOT EXISTS opportunity_risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI')),
  resolution TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TEXT
);

-- Ghi chú: Agent chỉ được ghi vào bảng này (Opportunity Research), không sửa bảng opportunities.
CREATE TABLE IF NOT EXISTS opportunity_research (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  run_id INTEGER REFERENCES ai_runs(id),
  importance TEXT NOT NULL CHECK (importance IN ('LOW','MEDIUM','HIGH')),
  summary TEXT NOT NULL,
  risks_json TEXT NOT NULL DEFAULT '[]',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','VERIFIED','DISMISSED')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Propose =====
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED','REJECTED','SUPERSEDED')),
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id),
  currency TEXT NOT NULL DEFAULT 'VND',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  max_discount_pct REAL NOT NULL DEFAULT 0,
  valid_until TEXT,
  notes TEXT,
  customer_response_note TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  sent_at TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (code, revision)
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  line_total INTEGER NOT NULL
);

-- ===== Close / Fulfill =====
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  quote_id INTEGER UNIQUE REFERENCES quotes(id),
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','IN_FULFILLMENT','FULFILLED','CANCELLED')),
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  price_locked_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fulfilled_at TEXT
);

CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  discount_pct REAL NOT NULL,
  line_total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fulfillment_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  order_line_id INTEGER REFERENCES order_lines(id),
  type TEXT NOT NULL CHECK (type IN ('LICENSE','DEPLOYMENT','TRAINING')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','DONE')),
  assignee_id INTEGER REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  milestone TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  erp_ref TEXT,
  created_by INTEGER REFERENCES users(id),
  issued_by INTEGER REFERENCES users(id),
  issued_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_at TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','ERP')),
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Kiểm soát, AI, truy vết =====
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('QUOTE_DISCOUNT','OPP_STAGE_GATE','LEGAL_REVIEW')),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reason TEXT,
  requested_by INTEGER REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  decision_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL CHECK (agent IN ('QUALIFICATION','OPPORTUNITY')),
  trigger TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  stop_reason TEXT,
  error TEXT,
  triggered_by INTEGER REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES ai_runs(id),
  agent TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ENRICHMENT','BANT_SCORE','EMAIL_DRAFT','DISQUALIFY','CONVERSION')),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','FAILED')),
  suggestion_id INTEGER REFERENCES ai_suggestions(id),
  approved_by INTEGER REFERENCES users(id),
  provider_ref TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  assignee_id INTEGER REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE')),
  source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER','AI')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER','AI','INTEGRATION','SYSTEM')),
  actor_id INTEGER,
  actor_label TEXT NOT NULL,
  reason TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
`;
