-- Add phone column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
