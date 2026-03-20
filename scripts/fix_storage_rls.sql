-- ================================================================
-- Fix Storage RLS Policies for payment-proofs bucket
-- Run this in the Supabase SQL Editor
-- ================================================================

-- 1. Allow authenticated users to upload payment proofs
INSERT INTO storage.policies (name, bucket_id, operation, definition, check_expression)
SELECT
    'Allow authenticated uploads',
    id,
    'INSERT',
    '(auth.role() = ''authenticated'')',
    '(auth.role() = ''authenticated'')'
FROM storage.buckets WHERE name = 'payment-proofs'
ON CONFLICT DO NOTHING;

-- 2. Allow authenticated users to read payment proofs  
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT
    'Allow authenticated reads',
    id,
    'SELECT',
    '(auth.role() = ''authenticated'')'
FROM storage.buckets WHERE name = 'payment-proofs'
ON CONFLICT DO NOTHING;

-- 3. Allow authenticated users to update/overwrite payment proofs
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT
    'Allow authenticated updates',
    id,
    'UPDATE',
    '(auth.role() = ''authenticated'')'
FROM storage.buckets WHERE name = 'payment-proofs'
ON CONFLICT DO NOTHING;

-- 4. Allow authenticated users to delete payment proofs
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT
    'Allow authenticated deletes',
    id,
    'DELETE',
    '(auth.role() = ''authenticated'')'
FROM storage.buckets WHERE name = 'payment-proofs'
ON CONFLICT DO NOTHING;
