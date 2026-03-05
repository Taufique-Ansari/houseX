-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (mirrors Supabase Auth, stores app-level profile)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'tenant')),
  flat TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly per-unit rates set by admin
CREATE TABLE electricity_rates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  total_units NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  per_unit_rate NUMERIC GENERATED ALWAYS AS (total_amount / total_units) STORED,
  source TEXT NOT NULL CHECK (source IN ('manual', 'bill_ocr')),
  bill_image_url TEXT,
  set_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- Meter readings per tenant per month
CREATE TABLE meter_readings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  reading_value NUMERIC NOT NULL,
  photo_url TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'ocr')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

-- Generated electricity bills
CREATE TABLE bills (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  prev_reading NUMERIC NOT NULL,
  curr_reading NUMERIC NOT NULL,
  units_used NUMERIC GENERATED ALWAYS AS (curr_reading - prev_reading) STORED,
  per_unit_rate NUMERIC NOT NULL,
  amount NUMERIC GENERATED ALWAYS AS ((curr_reading - prev_reading) * per_unit_rate) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_proof_url TEXT,
  paid_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

-- =================== ROW LEVEL SECURITY ===================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- PROFILES: users see only their own profile; admin sees all
CREATE POLICY "Users view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin views all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- RATES: everyone can read; only admin can write
CREATE POLICY "All users read rates" ON electricity_rates FOR SELECT USING (true);
CREATE POLICY "Admin manages rates" ON electricity_rates FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- READINGS: tenants see own; admin sees all; tenants can insert own
CREATE POLICY "Tenant reads own readings" ON meter_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin reads all readings" ON meter_readings FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Tenant inserts own reading" ON meter_readings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin inserts any reading" ON meter_readings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- BILLS: tenants see own; admin sees all; only admin generates bills; tenants can update payment
CREATE POLICY "Tenant reads own bills" ON bills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin reads all bills" ON bills FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin inserts bills" ON bills FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Tenant updates own payment" ON bills FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (status = 'paid');
