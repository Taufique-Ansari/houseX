-- ================================================================
-- HX — Complete Supabase Schema
-- Run this in the Supabase SQL Editor
-- WARNING: This drops existing VoltTrack tables first!
-- ================================================================

-- ─────── DROP OLD VOLTTRACK TABLES ───────
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS meter_readings CASCADE;
DROP TABLE IF EXISTS electricity_rates CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ─────── EXTENSIONS ───────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- PROFILES (linked to Supabase Auth)
-- ─────────────────────────────────────────────
CREATE TABLE profiles (
  id         UUID REFERENCES auth.users(id) PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'tenant')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TENANTS (extended profile for tenant-specific data)
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id                      UUID REFERENCES profiles(id) PRIMARY KEY,
  flat                    TEXT NOT NULL,
  rent_amount             NUMERIC NOT NULL DEFAULT 0,
  rent_due_day            INTEGER NOT NULL DEFAULT 5 CHECK (rent_due_day BETWEEN 1 AND 28),
  wifi_opted_in           BOOLEAN NOT NULL DEFAULT FALSE,
  move_in_date            DATE,
  lease_start_date        DATE,
  lease_end_date          DATE,
  security_deposit_amount NUMERIC NOT NULL DEFAULT 0,
  security_deposit_date   DATE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- RENT REVISION HISTORY
-- ─────────────────────────────────────────────
CREATE TABLE rent_revisions (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  old_amount     NUMERIC NOT NULL,
  new_amount     NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  reason         TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- UTILITY CONFIG (admin sets monthly)
-- ─────────────────────────────────────────────
CREATE TABLE utility_config (
  id                         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  month                      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                       INTEGER NOT NULL,
  electricity_per_unit_rate   NUMERIC,
  electricity_total_units     NUMERIC,
  electricity_total_amount    NUMERIC,
  electricity_source          TEXT CHECK (electricity_source IN ('manual', 'bill_ocr')),
  electricity_bill_image_url  TEXT,
  water_charge_per_tenant     NUMERIC NOT NULL DEFAULT 200,
  wifi_charge_per_tenant      NUMERIC NOT NULL DEFAULT 500,
  set_by                      UUID REFERENCES profiles(id),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- ─────────────────────────────────────────────
-- METER READINGS
-- ─────────────────────────────────────────────
CREATE TABLE meter_readings (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          INTEGER NOT NULL,
  reading_value NUMERIC NOT NULL,
  photo_url     TEXT,
  source        TEXT NOT NULL CHECK (source IN ('manual', 'ocr')),
  submitted_by  UUID REFERENCES profiles(id),
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, month, year)
);

-- ─────────────────────────────────────────────
-- STATEMENTS (central billing object)
-- ─────────────────────────────────────────────
CREATE TABLE statements (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL,

  rent_charge           NUMERIC NOT NULL DEFAULT 0,
  electricity_charge    NUMERIC NOT NULL DEFAULT 0,
  electricity_units     NUMERIC,
  electricity_rate      NUMERIC,
  prev_meter_reading    NUMERIC,
  curr_meter_reading    NUMERIC,
  water_charge          NUMERIC NOT NULL DEFAULT 0,
  wifi_charge           NUMERIC NOT NULL DEFAULT 0,
  one_time_charges      JSONB NOT NULL DEFAULT '[]',

  previous_dues         NUMERIC NOT NULL DEFAULT 0,
  credit_from_previous  NUMERIC NOT NULL DEFAULT 0,
  total_charges         NUMERIC GENERATED ALWAYS AS (
                          rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
                          COALESCE((SELECT SUM((item->>'amount')::numeric)
                            FROM jsonb_array_elements(one_time_charges) AS item), 0)
                        ) STORED,
  total_due             NUMERIC GENERATED ALWAYS AS (
                          rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
                          COALESCE((SELECT SUM((item->>'amount')::numeric)
                            FROM jsonb_array_elements(one_time_charges) AS item), 0)
                          - credit_from_previous
                        ) STORED,

  total_paid            NUMERIC NOT NULL DEFAULT 0,
  balance               NUMERIC GENERATED ALWAYS AS (
                          (rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
                          COALESCE((SELECT SUM((item->>'amount')::numeric)
                            FROM jsonb_array_elements(one_time_charges) AS item), 0)
                          - credit_from_previous) - total_paid
                        ) STORED,

  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'partial', 'paid', 'overdue')),
  due_date              DATE,
  is_prorated           BOOLEAN DEFAULT FALSE,
  proration_days        INTEGER,
  published_at          TIMESTAMPTZ,
  generated_by          UUID REFERENCES profiles(id),
  generated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, month, year)
);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  statement_id    UUID REFERENCES statements(id) ON DELETE CASCADE NOT NULL,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  payment_method  TEXT CHECK (payment_method IN ('upi', 'cash', 'bank_transfer', 'cheque', 'other')),
  proof_image_url TEXT,
  note            TEXT,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- LEDGER (immutable audit log)
-- ─────────────────────────────────────────────
CREATE TABLE ledger_entries (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  statement_id  UUID REFERENCES statements(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('charge', 'payment', 'credit', 'adjustment', 'deposit', 'refund')),
  description   TEXT NOT NULL,
  amount        NUMERIC NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TENANT DOCUMENTS
-- ─────────────────────────────────────────────
CREATE TABLE tenant_documents (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('rent_agreement', 'id_proof', 'move_in_checklist', 'other')),
  label       TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes       TEXT
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_statements_tenant_month ON statements(tenant_id, month, year);
CREATE INDEX idx_statements_status ON statements(status);
CREATE INDEX idx_payments_statement ON payments(statement_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_ledger_tenant ON ledger_entries(tenant_id);
CREATE INDEX idx_meter_readings_tenant ON meter_readings(tenant_id, month, year);

-- ─────────────────────────────────────────────
-- TRIGGER: Auto-update statement total_paid on payment insert
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_statement_total_paid()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE statements
  SET total_paid = (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE statement_id = NEW.statement_id
  )
  WHERE id = NEW.statement_id;

  UPDATE statements
  SET status = CASE
    WHEN total_due <= 0 THEN 'paid'
    WHEN (total_due - (
      SELECT COALESCE(SUM(amount), 0) FROM payments WHERE statement_id = NEW.statement_id
    )) <= 0 THEN 'paid'
    WHEN (
      SELECT COALESCE(SUM(amount), 0) FROM payments WHERE statement_id = NEW.statement_id
    ) > 0 THEN 'partial'
    ELSE status
  END
  WHERE id = NEW.statement_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_statement_total_paid();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER;

-- PROFILES
CREATE POLICY "Own profile" ON profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Admin manages profiles" ON profiles FOR ALL USING (is_admin());

-- TENANTS
CREATE POLICY "Tenant reads own" ON tenants FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Admin manages tenants" ON tenants FOR ALL USING (is_admin());

-- UTILITY CONFIG
CREATE POLICY "All read utility config" ON utility_config FOR SELECT USING (true);
CREATE POLICY "Admin manages utility config" ON utility_config FOR ALL USING (is_admin());

-- METER READINGS
CREATE POLICY "Tenant reads own readings" ON meter_readings FOR SELECT USING (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Tenant submits own reading" ON meter_readings FOR INSERT WITH CHECK (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Admin manages readings" ON meter_readings FOR ALL USING (is_admin());

-- STATEMENTS
CREATE POLICY "Tenant reads own statements" ON statements FOR SELECT USING (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Admin manages statements" ON statements FOR ALL USING (is_admin());

-- PAYMENTS
CREATE POLICY "Tenant reads own payments" ON payments FOR SELECT USING (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Tenant submits own payment" ON payments FOR INSERT WITH CHECK (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Admin manages payments" ON payments FOR ALL USING (is_admin());

-- LEDGER
CREATE POLICY "Tenant reads own ledger" ON ledger_entries FOR SELECT USING (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "System inserts ledger" ON ledger_entries FOR INSERT WITH CHECK (is_admin());

-- DOCUMENTS
CREATE POLICY "Tenant reads own docs" ON tenant_documents FOR SELECT USING (auth.uid() = tenant_id OR is_admin());
CREATE POLICY "Admin manages docs" ON tenant_documents FOR ALL USING (is_admin());
