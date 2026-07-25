-- Phase 4: extend the group-admin access clause to Supabase Storage, and add
-- the acting_as tag audit_log needs to distinguish a group_admin's action
-- inside an org they're not a direct member of.

-- ─── Storage: org-scoped attachment path (org/{orgId}/...) ─────────────────
-- The vendor-global compliance-doc policies (supabase/storage-setup.sql,
-- path {vendorId}/...) and the vendor-own-invoice policy (012, path
-- org/%/invoice/%) are untouched -- neither is keyed on org membership, so
-- group-admin access doesn't apply to them by design.
DROP POLICY IF EXISTS "Internal users manage org attachment storage" ON storage.objects;
CREATE POLICY "Internal users manage org attachment storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor')
    AND has_org_access(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'vendor-documents'
    AND name LIKE 'org/%'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor')
    AND has_org_access(((storage.foldername(name))[2])::uuid)
  );

-- ─── audit_log.acting_as ────────────────────────────────────────────────────
-- NULL = direct action by a local member/self. 'group_admin' = acting inside
-- an org the actor isn't a direct member of, reached only via group
-- membership. 'superadmin' reserved for platform-admin actions (e.g.
-- break-glass) that may want the same tagging later.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS acting_as text;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_acting_as_check
  CHECK (acting_as IS NULL OR acting_as IN ('group_admin', 'superadmin'));
