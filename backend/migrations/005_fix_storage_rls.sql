-- Fix Supabase Storage RLS for vendor-documents bucket.
-- This project uses custom JWT auth, so auth.uid() returns null.
-- Policies based on auth.uid() block all uploads — replace with bucket-scoped open policies.
-- Access security is enforced at the API layer (requireAuth middleware).

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-documents', 'vendor-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Vendor document uploads" ON storage.objects;
DROP POLICY IF EXISTS "Vendor document reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow vendor uploads" ON storage.objects;
DROP POLICY IF EXISTS "vendor_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "vendor_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "vendor_docs_delete" ON storage.objects;

CREATE POLICY "vendor_docs_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vendor-documents');

CREATE POLICY "vendor_docs_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-documents');

CREATE POLICY "vendor_docs_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vendor-documents');
