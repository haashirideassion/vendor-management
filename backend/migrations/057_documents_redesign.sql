-- Vendor Onboarding Redesign, Phase 5: Documents redesign.
--
-- Single polymorphic `documents` table replacing the fixed 5-type,
-- vendor-only `vendor_documents` shape -- attaches to any of the entities
-- introduced so far (vendor/legal_entity/tax_registration/
-- compliance_registration/bank_account/tax_exception), supports proper
-- versioning (a replace inserts a new row and retires the old one, never an
-- overwrite), and carries its own expiry for the expiry-notification
-- requirement.
--
-- `related_entity_type`/`related_entity_id` is polymorphic, same pattern as
-- verifications.subject_type/subject_id from Phase 3 -- no cross-table FK,
-- enforced at the application layer.
--
-- vendor_documents is NOT touched or dropped -- it's still the table the
-- live upload-document route reads and writes today, same reasoning as
-- vendors.bank_* in Phase 4. This migration only backfills COPIES into the
-- new table; route cutover is separate, later work.
--
-- Legacy backfill mapping (deliberately conservative): tc_agreement is
-- Vendor-Group-level (matches the onboarding blueprint's document-ownership
-- design -- it's the master agreement, not tied to any one Legal Entity),
-- everything else (insurance_coi, bank_letter, tax_certificate, other) is
-- backfilled at the default Legal Entity level rather than guessed onto a
-- specific tax_registration/bank_account row. Legacy vendor_documents rows
-- carry no link to which specific registration/account they belonged to
-- (there could be 2 tax_registrations -- PAN and GSTIN -- per entity, and
-- guessing which one a legacy tax_certificate matches would risk being
-- wrong). Precise per-registration/per-account document linkage is
-- available going forward for anything uploaded through the new model;
-- legacy rows just don't have the data to place them more precisely than
-- "belongs to this vendor's default entity."
--
-- Signed/short-lived URL access and never-public-links (confirmed
-- requirement) is a storage/route-layer concern, not something a migration
-- enforces -- storage_path here follows the same private-bucket convention
-- vendor_documents already uses.

-- ─── documents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_entity_type text NOT NULL CHECK (related_entity_type IN (
                         'vendor', 'legal_entity', 'tax_registration',
                         'compliance_registration', 'bank_account', 'tax_exception'
                       )),
  related_entity_id  uuid NOT NULL,
  category            text NOT NULL CHECK (category IN (
                         'agreement', 'registration', 'tax', 'compliance',
                         'banking', 'msme', 'exception', 'insurance', 'other'
                       )),
  document_type       text NOT NULL CHECK (document_type IN (
                         'tc_agreement', 'insurance_coi', 'bank_letter', 'tax_certificate',
                         'registration_certificate', 'gst_certificate', 'msme_certificate',
                         'exception_certificate', 'other'
                       )),
  file_name           text NOT NULL,
  storage_path        text NOT NULL,
  version             integer NOT NULL DEFAULT 1,
  -- Only one current version per (entity, document_type) -- a replace
  -- inserts a new row with is_current = true and this migration's own
  -- application-layer replace logic flips the prior row to false; never an
  -- UPDATE of storage_path in place.
  is_current          boolean NOT NULL DEFAULT true,
  uploaded_by         uuid REFERENCES profiles(id),
  uploaded_at         timestamptz DEFAULT now(),
  expires_at          date,
  verification_status text NOT NULL DEFAULT 'not_verified'
                        CHECK (verification_status IN ('not_verified', 'pending', 'verified', 'failed', 'manual_review')),
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_related_entity ON documents(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_expires_at ON documents(expires_at) WHERE expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_one_current_per_entity_type
  ON documents(related_entity_type, related_entity_id, document_type) WHERE is_current;

DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Backfill: copy existing vendor_documents into the new model ──────────
-- Legacy vendor_documents has no versioning concept -- a vendor can have
-- more than one row of the same document_type (e.g. re-uploaded their T&C
-- agreement at some point), which would collide with the new
-- one-current-per-(entity,document_type) rule if every copied row were
-- naively marked is_current = true. Rank by uploaded_at instead: the most
-- recent row per group becomes the current version, older ones are copied
-- as history (is_current = false, version numbered oldest-first).
WITH ranked_tc AS (
  SELECT
    vd.*,
    ROW_NUMBER() OVER (PARTITION BY vd.vendor_id, vd.document_type ORDER BY vd.uploaded_at ASC)  AS version_num,
    ROW_NUMBER() OVER (PARTITION BY vd.vendor_id, vd.document_type ORDER BY vd.uploaded_at DESC) AS rn_desc
  FROM vendor_documents vd
  WHERE vd.document_type = 'tc_agreement'
)
INSERT INTO documents (related_entity_type, related_entity_id, category, document_type, file_name, storage_path, version, is_current, uploaded_at, expires_at, verification_status)
SELECT
  'vendor',
  r.vendor_id,
  'agreement',
  r.document_type,
  r.file_name,
  r.storage_path,
  r.version_num,
  (r.rn_desc = 1),
  r.uploaded_at,
  r.expires_at,
  CASE WHEN r.verified THEN 'verified' ELSE 'not_verified' END
FROM ranked_tc r
WHERE NOT EXISTS (
  SELECT 1 FROM documents d
  WHERE d.related_entity_type = 'vendor' AND d.related_entity_id = r.vendor_id
    AND d.document_type = r.document_type AND d.storage_path = r.storage_path
);

WITH ranked_other AS (
  SELECT
    vd.*,
    le.id AS legal_entity_id,
    ROW_NUMBER() OVER (PARTITION BY le.id, vd.document_type ORDER BY vd.uploaded_at ASC)  AS version_num,
    ROW_NUMBER() OVER (PARTITION BY le.id, vd.document_type ORDER BY vd.uploaded_at DESC) AS rn_desc
  FROM vendor_documents vd
  JOIN legal_entities le ON le.vendor_id = vd.vendor_id AND le.is_default
  WHERE vd.document_type <> 'tc_agreement'
)
INSERT INTO documents (related_entity_type, related_entity_id, category, document_type, file_name, storage_path, version, is_current, uploaded_at, expires_at, verification_status)
SELECT
  'legal_entity',
  r.legal_entity_id,
  CASE r.document_type
    WHEN 'insurance_coi'   THEN 'insurance'
    WHEN 'bank_letter'     THEN 'banking'
    WHEN 'tax_certificate' THEN 'tax'
    ELSE 'other'
  END,
  r.document_type,
  r.file_name,
  r.storage_path,
  r.version_num,
  (r.rn_desc = 1),
  r.uploaded_at,
  r.expires_at,
  CASE WHEN r.verified THEN 'verified' ELSE 'not_verified' END
FROM ranked_other r
WHERE NOT EXISTS (
  SELECT 1 FROM documents d
  WHERE d.related_entity_type = 'legal_entity' AND d.related_entity_id = r.legal_entity_id
    AND d.document_type = r.document_type AND d.storage_path = r.storage_path
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents: vendor reads own (any entity level), admin all"
  ON documents FOR SELECT
  USING (
    is_admin() OR (
      documents.related_entity_type = 'vendor' AND EXISTS (
        SELECT 1 FROM vendor_users vu
        WHERE vu.vendor_id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      documents.related_entity_type = 'legal_entity' AND EXISTS (
        SELECT 1 FROM legal_entities le
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE le.id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      documents.related_entity_type = 'tax_registration' AND EXISTS (
        SELECT 1 FROM tax_registrations tr
        JOIN legal_entities le ON le.id = tr.legal_entity_id
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE tr.id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      documents.related_entity_type = 'compliance_registration' AND EXISTS (
        SELECT 1 FROM compliance_registrations cr
        JOIN legal_entities le ON le.id = cr.legal_entity_id
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE cr.id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      documents.related_entity_type = 'bank_account' AND EXISTS (
        SELECT 1 FROM bank_accounts ba
        JOIN legal_entities le ON le.id = ba.legal_entity_id
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE ba.id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      documents.related_entity_type = 'tax_exception' AND EXISTS (
        SELECT 1 FROM tax_exceptions te
        JOIN legal_entities le ON le.id = te.legal_entity_id
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE te.id = documents.related_entity_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    )
  );

CREATE POLICY "documents: admin manages all" ON documents FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── Fix: Phase 3's verifications policy predates bank_accounts existing ───
-- (bank_accounts was Phase 4, after Phase 3 was written) -- add the missing
-- branch now that the table it needs to join through actually exists.
DROP POLICY IF EXISTS "verifications: readable via owning tax/compliance registration, admin all" ON verifications;

CREATE POLICY "verifications: readable via owning subject, admin all"
  ON verifications FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM tax_registrations tr
      JOIN legal_entities le ON le.id = tr.legal_entity_id
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE verifications.subject_type = 'tax_registration'
        AND tr.id = verifications.subject_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM compliance_registrations cr
      JOIN legal_entities le ON le.id = cr.legal_entity_id
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE verifications.subject_type = 'compliance_registration'
        AND cr.id = verifications.subject_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM bank_accounts ba
      JOIN legal_entities le ON le.id = ba.legal_entity_id
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE verifications.subject_type = 'bank_account'
        AND ba.id = verifications.subject_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );
