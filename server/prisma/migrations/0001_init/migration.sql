-- =====================================================================
-- Subscription Management System — PostgreSQL schema (v1)
-- Target: PostgreSQL 15+
-- Money: NUMERIC(12,2). Dates: DATE for billing, TIMESTAMPTZ for audit.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive unique email

-- ---------- Enums ----------
CREATE TYPE user_role           AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
CREATE TYPE product_type        AS ENUM ('SERVICE', 'GOODS', 'ADDON');
CREATE TYPE billing_period      AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE subscription_status AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED');
CREATE TYPE invoice_status      AS ENUM ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED');
CREATE TYPE discount_type       AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE discount_scope      AS ENUM ('PRODUCT', 'SUBSCRIPTION');
CREATE TYPE payment_method      AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER');

-- ---------- Users & auth ----------
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          CITEXT       NOT NULL UNIQUE,              -- one account per email
  password_hash  TEXT         NOT NULL,                     -- bcrypt
  full_name      TEXT         NOT NULL,
  role           user_role    NOT NULL DEFAULT 'CUSTOMER',
  phone          TEXT,
  company_name   TEXT,
  address        TEXT,
  gstin          TEXT,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by     BIGINT       REFERENCES users(id),         -- admin who created staff
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,                  -- sha256 of the emailed token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Catalog ----------
CREATE TABLE taxes (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT          NOT NULL UNIQUE,                -- e.g. 'GST 18%'
  rate        NUMERIC(5,2)  NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT          NOT NULL,
  type            product_type  NOT NULL DEFAULT 'SERVICE',
  sales_price     NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  default_tax_id  BIGINT        REFERENCES taxes(id),
  notes           TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute    TEXT          NOT NULL,                      -- e.g. 'Brand'
  value        TEXT          NOT NULL,                      -- e.g. 'Odoo'
  extra_price  NUMERIC(12,2) NOT NULL DEFAULT 0,            -- e.g. 560
  UNIQUE (product_id, attribute, value)
);

-- ---------- Plans ----------
CREATE TABLE plans (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT           NOT NULL,
  price            NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  billing_period   billing_period NOT NULL,
  min_quantity     INT            NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from   DATE           NOT NULL,
  available_to     DATE,
  auto_close       BOOLEAN        NOT NULL DEFAULT FALSE,   -- closes itself at expiry
  is_closable      BOOLEAN        NOT NULL DEFAULT TRUE,    -- can be closed early
  is_pausable      BOOLEAN        NOT NULL DEFAULT FALSE,
  is_renewable     BOOLEAN        NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CHECK (available_to IS NULL OR available_to >= available_from)
);

-- ---------- Quotation templates ----------
CREATE TABLE quotation_templates (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT        NOT NULL,
  plan_id             BIGINT      NOT NULL REFERENCES plans(id),
  validity_days       INT         NOT NULL CHECK (validity_days > 0),
  payment_terms_days  INT         NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_lines (
  id           BIGSERIAL PRIMARY KEY,
  template_id  BIGINT        NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id   BIGINT        NOT NULL REFERENCES products(id),
  variant_id   BIGINT        REFERENCES product_variants(id),
  quantity     INT           NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,2),                               -- NULL = use product price
  tax_id       BIGINT        REFERENCES taxes(id)
);

-- ---------- Subscriptions ----------
CREATE SEQUENCE subscription_number_seq START 1;

CREATE TABLE subscriptions (
  id                  BIGSERIAL PRIMARY KEY,
  number              TEXT        NOT NULL UNIQUE
                      DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0')),
  customer_id         BIGINT      NOT NULL REFERENCES users(id),
  plan_id             BIGINT      NOT NULL REFERENCES plans(id),
  template_id         BIGINT      REFERENCES quotation_templates(id),
  status              subscription_status NOT NULL DEFAULT 'DRAFT',
  start_date          DATE        NOT NULL,
  expiry_date         DATE,                                  -- NULL = open-ended
  quotation_valid_until DATE,
  payment_terms_days  INT         NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  next_billing_date   DATE,                                  -- set when it becomes ACTIVE
  paused_at           DATE,
  closed_at           TIMESTAMPTZ,
  notes               TEXT,
  created_by          BIGINT      REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR expiry_date >= start_date)
);

CREATE TABLE subscription_lines (
  id               BIGSERIAL PRIMARY KEY,
  subscription_id  BIGINT        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id       BIGINT        NOT NULL REFERENCES products(id),
  variant_id       BIGINT        REFERENCES product_variants(id),
  quantity         INT           NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),  -- incl. variant extra
  tax_id           BIGINT        REFERENCES taxes(id)
);

CREATE TABLE subscription_status_history (
  id               BIGSERIAL PRIMARY KEY,
  subscription_id  BIGINT      NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_status      subscription_status,
  to_status        subscription_status NOT NULL,
  changed_by       BIGINT      REFERENCES users(id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Discounts ----------
CREATE TABLE discounts (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT          NOT NULL,
  type              discount_type NOT NULL,
  value             NUMERIC(12,2) NOT NULL CHECK (value > 0),
  scope             discount_scope NOT NULL,
  min_purchase      NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity      INT           NOT NULL DEFAULT 0,
  start_date        DATE          NOT NULL,
  end_date          DATE,
  usage_limit       INT           CHECK (usage_limit IS NULL OR usage_limit > 0),  -- NULL = unlimited
  used_count        INT           NOT NULL DEFAULT 0,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by        BIGINT        NOT NULL REFERENCES users(id),   -- must be ADMIN (checked in API)
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (type <> 'PERCENTAGE' OR value <= 100),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit)
);

-- which products / subscriptions a discount targets
CREATE TABLE discount_products (
  discount_id  BIGINT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

CREATE TABLE discount_subscriptions (
  discount_id      BIGINT NOT NULL REFERENCES discounts(id)     ON DELETE CASCADE,
  subscription_id  BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, subscription_id)
);

-- ---------- Invoices ----------
CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id               BIGSERIAL PRIMARY KEY,
  number           TEXT           NOT NULL UNIQUE
                   DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  subscription_id  BIGINT         NOT NULL REFERENCES subscriptions(id),
  customer_id      BIGINT         NOT NULL REFERENCES users(id),
  period_start     DATE           NOT NULL,
  period_end       DATE           NOT NULL,
  invoice_date     DATE           NOT NULL,
  due_date         DATE           NOT NULL,
  status           invoice_status NOT NULL DEFAULT 'DRAFT',
  subtotal         NUMERIC(12,2)  NOT NULL DEFAULT 0,
  discount_total   NUMERIC(12,2)  NOT NULL DEFAULT 0,
  tax_total        NUMERIC(12,2)  NOT NULL DEFAULT 0,
  total            NUMERIC(12,2)  NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2)  NOT NULL DEFAULT 0,
  -- snapshot of customer details at invoice time
  bill_to_name     TEXT           NOT NULL,
  bill_to_email    TEXT           NOT NULL,
  bill_to_address  TEXT,
  sent_at          TIMESTAMPTZ,
  confirmed_at     TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoice_period UNIQUE (subscription_id, period_start),   -- NO DOUBLE BILLING
  CHECK (period_end > period_start),
  CHECK (due_date >= invoice_date),
  CHECK (amount_paid >= 0),
  CHECK (total = subtotal - discount_total + tax_total)
);

CREATE TABLE invoice_lines (
  id               BIGSERIAL PRIMARY KEY,
  invoice_id       BIGINT        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id       BIGINT        REFERENCES products(id),
  description      TEXT          NOT NULL,          -- snapshot: 'CRM Pro (Brand: Odoo)'
  quantity         INT           NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12,2) NOT NULL,
  line_subtotal    NUMERIC(12,2) NOT NULL,          -- qty * unit_price
  discount_id      BIGINT        REFERENCES discounts(id),
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_name         TEXT,
  tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0, -- snapshot of rate
  tax_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total       NUMERIC(12,2) NOT NULL,
  CHECK (line_total = line_subtotal - discount_amount + tax_amount)
);

-- discount usage ledger: one row per invoice that consumed a discount
CREATE TABLE discount_redemptions (
  id           BIGSERIAL PRIMARY KEY,
  discount_id  BIGINT      NOT NULL REFERENCES discounts(id),
  invoice_id   BIGINT      NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (discount_id, invoice_id)
);

-- ---------- Payments ----------
CREATE TABLE payments (
  id           BIGSERIAL PRIMARY KEY,
  invoice_id   BIGINT         NOT NULL REFERENCES invoices(id),
  method       payment_method NOT NULL,
  amount       NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  paid_on      DATE           NOT NULL,
  reference    TEXT,                                -- UTR / cheque no.
  note         TEXT,
  recorded_by  BIGINT         NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ---------- Billing run log ----------
CREATE TABLE billing_runs (
  id                  BIGSERIAL PRIMARY KEY,
  run_date            DATE        NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  invoices_created    INT         NOT NULL DEFAULT 0,
  subscriptions_closed INT        NOT NULL DEFAULT 0,
  errors              JSONB       NOT NULL DEFAULT '[]',
  triggered_by        BIGINT      REFERENCES users(id)          -- NULL = scheduler
);

-- ---------- Indexes for the 2-second rule ----------
CREATE INDEX idx_subs_billing_due   ON subscriptions (next_billing_date) WHERE status = 'ACTIVE';
CREATE INDEX idx_subs_customer      ON subscriptions (customer_id);
CREATE INDEX idx_subs_status        ON subscriptions (status);
CREATE INDEX idx_sub_lines_sub      ON subscription_lines (subscription_id);
CREATE INDEX idx_invoices_customer  ON invoices (customer_id);
CREATE INDEX idx_invoices_status_due ON invoices (status, due_date);
CREATE INDEX idx_invoices_date      ON invoices (invoice_date);
CREATE INDEX idx_invoice_lines_inv  ON invoice_lines (invoice_id);
CREATE INDEX idx_payments_invoice   ON payments (invoice_id);
CREATE INDEX idx_payments_paid_on   ON payments (paid_on);
CREATE INDEX idx_discounts_active   ON discounts (start_date, end_date) WHERE is_active;

-- ---------- Handy view: overdue is derived, never stored ----------
CREATE VIEW v_invoice_balance AS
SELECT i.*,
       (i.total - i.amount_paid)                                   AS balance_due,
       (i.status = 'CONFIRMED' AND i.amount_paid < i.total
        AND i.due_date < CURRENT_DATE)                             AS is_overdue
FROM invoices i;
