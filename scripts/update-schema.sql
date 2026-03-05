-- Run this in Supabase SQL Editor to apply updates

ALTER TABLE statements
  ADD COLUMN previous_dues NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE statements
  DROP COLUMN total_charges,
  DROP COLUMN total_due,
  DROP COLUMN balance;

ALTER TABLE statements
  ADD COLUMN total_charges NUMERIC GENERATED ALWAYS AS (
    rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
    COALESCE((SELECT SUM((item->>'amount')::numeric) FROM jsonb_array_elements(one_time_charges) AS item), 0)
  ) STORED,
  ADD COLUMN total_due NUMERIC GENERATED ALWAYS AS (
    rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
    COALESCE((SELECT SUM((item->>'amount')::numeric) FROM jsonb_array_elements(one_time_charges) AS item), 0)
    - credit_from_previous
  ) STORED,
  ADD COLUMN balance NUMERIC GENERATED ALWAYS AS (
    (rent_charge + electricity_charge + water_charge + wifi_charge + previous_dues +
    COALESCE((SELECT SUM((item->>'amount')::numeric) FROM jsonb_array_elements(one_time_charges) AS item), 0)
    - credit_from_previous) - total_paid
  ) STORED;

-- Next time `schema.sql` is run on a fresh DB, the new columns are already in there
