-- Phase 7: org-scope the transactional attachments storage path.
--
-- Old path: attachments/{entityType}/{entityId}/{uid}.ext -- no org segment,
-- and the existing storage.objects policies only checked role, not org
-- membership, so any internal user of any org could read/write any other
-- org's attachment files directly via Supabase Storage.
--
-- New path: org/{orgId}/{entityType}/{entityId}/{uid}.ext
--
-- Vendor-global compliance documents (vendor-documents/{vendorId}/... via
-- vendors.ts upload-document, and the onboarding useDocuments.ts hook) are
-- untouched -- they're vendor-global by design, not org-scoped.

DROP POLICY IF EXISTS "Internal users manage attachment storage" ON storage.objects;
DROP POLICY IF EXISTS "Vendors manage invoice attachment storage" ON storage.objects;

-- Internal (non-vendor) users can read/write attachment files only for orgs
-- they're a member of. Path segment 2 (0-indexed from storage.foldername)
-- is the org id: org/{orgId}/...
CREATE POLICY "Internal users manage org attachment storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor')
    AND is_org_member(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor')
    AND is_org_member(((storage.foldername(name))[2])::uuid)
  );

-- Vendors can read/write attachment files only for their OWN invoices
-- (previously this only checked role='vendor' with no ownership check at
-- all -- any vendor could read/write any other vendor's invoice files).
-- Path: org/{orgId}/invoice/{invoiceId}/{uid}.ext
CREATE POLICY "Vendors manage own invoice attachment storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%/invoice/%'
    AND EXISTS (
      SELECT 1 FROM invoices i
      JOIN vendors v ON v.id = i.vendor_id
      WHERE v.profile_id = auth.uid()
        AND i.id::text = (storage.foldername(name))[4]
    )
  )
  WITH CHECK (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%/invoice/%'
    AND EXISTS (
      SELECT 1 FROM invoices i
      JOIN vendors v ON v.id = i.vendor_id
      WHERE v.profile_id = auth.uid()
        AND i.id::text = (storage.foldername(name))[4]
    )
  );
