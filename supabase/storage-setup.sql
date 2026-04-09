-- Run this in the Supabase SQL Editor to create the storage bucket and policies.
-- Dashboard → Storage → (or paste below in SQL Editor)

-- 1. Create the private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-documents',
  'vendor-documents',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Vendors can upload to their own folder (path: {vendor_id}/...)
CREATE POLICY "vendors upload own documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM vendors WHERE profile_id = auth.uid()
  )
);

-- 3. Vendors can read their own documents
CREATE POLICY "vendors read own documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM vendors WHERE profile_id = auth.uid()
  )
);

-- 4. Admins can read all documents
CREATE POLICY "admins read all documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND is_admin()
);

-- 5. Admins can delete documents
CREATE POLICY "admins delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND is_admin()
);
