-- Run this in the Supabase SQL Editor to create the storage bucket and policies.
-- Dashboard → Storage → (or paste below in SQL Editor)
--
-- Idempotent throughout (DROP POLICY IF EXISTS before every CREATE POLICY,
-- matching backend/migrations/*.sql's convention) -- safe to re-run the
-- whole file any time, e.g. after adding a new section further down. A
-- previous run hit ERROR 42710 ("policy ... already exists") on section 2
-- because CREATE POLICY has no ON CONFLICT/IF NOT EXISTS of its own and
-- Postgres aborts the whole script on the first error -- that's what left
-- section 6-8 (org-onboarding-documents) never actually created even though
-- the file had been "run".

-- 1. Create the private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-documents',
  'vendor-documents',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 1b. Bucket already existed with the old (PDF/image-only) allowlist — widen it in place.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp'
]
WHERE id = 'vendor-documents';

-- 2. Vendors can upload to their own folder (path: {vendor_id}/...)
DROP POLICY IF EXISTS "vendors upload own documents" ON storage.objects;
CREATE POLICY "vendors upload own documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM vendors WHERE profile_id = auth.uid()
  )
);

-- 3. Vendors can read their own documents
DROP POLICY IF EXISTS "vendors read own documents" ON storage.objects;
CREATE POLICY "vendors read own documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM vendors WHERE profile_id = auth.uid()
  )
);

-- 4. Admins can read all documents
DROP POLICY IF EXISTS "admins read all documents" ON storage.objects;
CREATE POLICY "admins read all documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND is_admin()
);

-- 5. Admins can delete documents
DROP POLICY IF EXISTS "admins delete documents" ON storage.objects;
CREATE POLICY "admins delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND is_admin()
);

-- 6. Organisation onboarding documents bucket (Certificate of Incorporation,
-- PAN copy, MOA, AOA, Board Resolution, bank proof, optional GST cert,
-- authorized signatory signature) -- same 15MB / PDF-JPEG-DOCX allowlist as
-- the vendor-documents upload validation (backend/src/routes/vendors.ts's
-- /upload-document), storage path {org_id}/{document_type}_{timestamp}.{ext}
-- (backend/src/routes/orgOnboarding.ts). Express uploads via the service-role
-- key and bypasses these policies entirely -- they're defense-in-depth only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-onboarding-documents',
  'org-onboarding-documents',
  false,
  15728640, -- 15 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 7. Org members can upload/read within their own org's folder ({org_id}/...)
DROP POLICY IF EXISTS "org onboarding docs: org members upload own org" ON storage.objects;
CREATE POLICY "org onboarding docs: org members upload own org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-onboarding-documents'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "org onboarding docs: org members read own org" ON storage.objects;
CREATE POLICY "org onboarding docs: org members read own org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'org-onboarding-documents'
  AND (is_org_member((storage.foldername(name))[1]::uuid) OR is_platform_admin())
);

-- 8. Platform admins (reviewing submissions) can delete any org's documents
DROP POLICY IF EXISTS "org onboarding docs: platform admins delete" ON storage.objects;
CREATE POLICY "org onboarding docs: platform admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'org-onboarding-documents'
  AND is_platform_admin()
);
